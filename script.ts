/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch, loadAsPromise } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security, IStructure } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
// var JSONWriter = require('json-writer');
var fs = require('fs');
var ws = fs.createWriteStream('./tmp/mendix.json');
// ws.on('close', function() {
//     console.log(fs.readFileSync('./tmp/mendix.json', 'UTF-8'));
// });
// var jw = new JSONWriter(false, function(string, encoding) {
//     ws.write(string, encoding);
// });
const jsonObj = {};

const username = "simon.black@mendix.com";
const apikey = "ba47d0a1-9991-45ee-a14d-d0c1b73d5279";
const projectId = "bce92469-dd44-4414-a7fb-af659a2cee44";
const projectName = "NaturesPrideDemo";
const revNo = -1; // -1 for latest
const branchName = null // null for mainline
const wc = null;
const client = new MendixSdkClient(username, apikey);
/*
 * PROJECT TO ANALYZE
 */
const project = new Project(client, projectId, projectName);

client.platform().createOnlineWorkingCopy(project, new Revision(revNo, new Branch(project, branchName)))
    .then(workingCopy => loadProjectSecurity(workingCopy))
    .then(projectSecurity => getAllUserRoles(projectSecurity))
    .then(userRoles => loadAllUserNavigation(userRoles))

    .done(
    () => {
        var jsonString = JSON.stringify(jsonObj);
        ws.write(jsonString);
        ws.end();
        console.log("Done.");
    },
    error => {
        console.log("Something went wrong:");
        console.dir(error);
    });

function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.INavigationDocument {
    return workingCopy.model().allNavigationDocuments()[0];
}

function processNavigation(role: security.IUserRole, nav: navigation.INavigationDocument, element): when.Promise<void> {
    return loadAsPromise(nav).then(navDoc => {
        let usersHomepage = navDoc.desktopProfile.roleBasedHomePages.filter(roleBasedHomepage => roleBasedHomepage.userRole.name === role.name)[0];
        if (usersHomepage != null) {
            if (usersHomepage.page != null) {
                console.log(`${role.name} homepage = ${usersHomepage.page.name}`);
                return loadPage(usersHomepage.page).then(pg => { processButtons(element, getStructures(pg, element)) });
            } else if (usersHomepage.microflow != null) {
                console.log(`${role.name} homepage = ${usersHomepage.microflow.name}`);
                return loadMicroflow(usersHomepage.microflow).then(mf => { traverseMicroflow(mf, element) });
            }
        }
        return;
    });
};
function loadProjectSecurity(workingCopy: OnlineWorkingCopy): when.Promise<security.ProjectSecurity> {
    return loadAsPromise(workingCopy.model().allProjectSecurities()[0]);
}

function loadAllUserNavigation(userRoles: security.UserRole[]): when.Promise<security.UserRole[]> {
    return when.all<security.UserRole[]>(userRoles.map(processUsersNavigation));
}
function getAllUserRoles(projectSecurity: security.ProjectSecurity): security.UserRole[] {
    return projectSecurity.userRoles;
}

function processUsersNavigation(role: security.UserRole): when.Promise<void> {
    var nav = role.model.allNavigationDocuments()[0];
    jsonObj[role.name] = {};
    console.log(`Processing user navigation for: ${role.name}`);
    return processNavigation(role, nav, jsonObj[role.name]);
}

function loadPage(page: pages.IPage): when.Promise<pages.Page> {
    return loadAsPromise(page);
}

function getStructures(pageLoaded: pages.Page, element): IStructure[] {
    console.log(`Traversing page: ${pageLoaded.name}`);
    element[pageLoaded.name] = {};
    var buttons = [];
    pageLoaded.traverse(function(structure) {
        if (structure instanceof pages.Button || structure instanceof pages.ControlBarButton) {
            buttons.push(structure);
        }
    });
    return buttons;
}

function traversePage(pageLoaded: pages.Page, element): when.Promise<void> {
    console.log(`Traversing page: ${pageLoaded.name}`);
    element[pageLoaded.name] = {};
    var buttons = [];
    pageLoaded.traverse(function(structure) {
        if (structure instanceof pages.Button || structure instanceof pages.ControlBarButton) {
            buttons.push(structure);
        }
    });
    return processButtons(element[pageLoaded.name], buttons);
}
function processButtons(element, buttons: IStructure[]): when.Promise<void> {
    return when.all<void>(buttons.map(btn => { traverseElement(element, btn) }));
}

function traverseElement(element, structure: IStructure): when.Promise<void> {
    if (structure != null) {
        if (structure instanceof pages.Button) {
            return processButton(structure, element);
        } else if (structure instanceof pages.ControlBarButton) {
            return processControlBarButton(structure, element);
        }
    }
}

function processControlBarButton(button: pages.ControlBarButton, element): when.Promise<void> {
    if (button instanceof pages.GridEditButton) {
        return loadPage(button.pageSettings.page).then(pg => { processButtons(element, getStructures(pg, element)) });
    } else if (button instanceof pages.DataViewActionButton) {
        var action = button.action;
        if (action instanceof pages.MicroflowClientAction) {
            return loadMicroflow(action.microflowSettings.microflow).then(mf=> { traverseMicroflow(mf, element) });
        } else if (action instanceof pages.PageClientAction) {
            return loadPage(action.pageSettings.page).then(pg => { processButtons(element, getStructures(pg, element)) });
        }
    }
}


function processButton(button: pages.Button, element): when.Promise<void> {
    if (button instanceof pages.ActionButton) {
        var action = button.action;
        if (action instanceof pages.MicroflowClientAction) {
            if (action.microflowSettings.microflow != null) {
                return loadMicroflow(action.microflowSettings.microflow).then(mf=> { traverseMicroflow(mf, element) });
            }
        }
        else if (action instanceof pages.PageClientAction) {
            if (action.pageSettings.page != null) {
                return loadPage(action.pageSettings.page).then(pg=> { processButtons(element, getStructures(pg, element)) });
            }
        }
    } else if (button instanceof pages.DropDownButton) {

    } else if (button instanceof pages.NewButton) {
        return loadPage(button.pageSettings.page).then(pg => { processButtons(element, getStructures(pg, element)) });
    }
}

function traverseMicroflowActions(actions: microflows.MicroflowObject[], element): when.Promise<void> {
    return when.all<void>(actions.map(act=> { processAction(act, element) }));
}

function processAction(mfAction: microflows.MicroflowObject, element): when.Promise<void> {
    if (mfAction instanceof microflows.ShowPageAction) {
        var activity = <microflows.ActionActivity>mfAction;
        var action = activity.action;
        if (action instanceof microflows.ShowPageAction) {
            return loadPage(action.pageSettings.page).then(pg => { processButtons(element, getStructures(pg, element)) });
        }
    }
    else if (mfAction instanceof microflows.ShowHomePageAction) {
        element["Show Homepage"];
    } else if (mfAction instanceof microflows.MicroflowCallAction) {
        var activity = <microflows.ActionActivity>mfAction;
        var action = activity.action;
        if (action instanceof microflows.MicroflowCallAction) {
            return loadMicroflow(action.microflowCall.microflow).then(mf => {
                traverseMicroflow(mf, element)
            })

        }
    }
}

function loadMicroflow(microflow: microflows.IMicroflow): when.Promise<microflows.Microflow> {
    return loadAsPromise(microflow);
}

function traverseMicroflow(microflow: microflows.Microflow, element): when.Promise<void> {
    console.log(`Traversing Microflow for: ${microflow.name}`);
    element[microflow.name] = {};
    return traverseMicroflowActions(microflow.objectCollection.objects.filter(o => o instanceof microflows.ShowPageAction || o instanceof microflows.ShowHomePageAction || o instanceof microflows.MicroflowCallAction), element[microflow.name]);
}
