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
var nav = <navigation.NavigationDocument>nav;
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
                return traversePage(usersHomepage.page, element);
            } else if (usersHomepage.microflow != null) {
                console.log(`${role.name} homepage = ${usersHomepage.microflow.name}`);
                traverseMicroflow(usersHomepage.microflow, element);
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


function traversePage(page: pages.IPage, element): when.Promise<void> {
    console.log(`Traversing page: ${page.name}`);
    return loadAsPromise(page).then(pageLoaded => {
        element[page.name] = {};
        pageLoaded.traverse(function(structure){
            traverseElement(element[page.name], structure);
        });
    });

}
function traverseElement(element, structure: IStructure): when.Promise<void> {
    if (structure != null) {
        if (structure instanceof pages.Button) {
           return processButton(structure, element);
        } else if(structure instanceof pages.ControlBarButton){
           return processControlBarButton(structure,element);
        }
    } 
        return;
}

function processControlBarButton(button: pages.ControlBarButton, element): when.Promise<void> {
    if(button instanceof pages.GridEditButton){
        return traversePage(button.pageSettings.page,element);
    }else if(button instanceof pages.DataViewActionButton){
        var action = button.action;
        if(action instanceof pages.MicroflowClientAction){
            return traverseMicroflow(action.microflowSettings.microflow,element);
        }else if (action instanceof pages.PageClientAction){
            return traversePage(action.pageSettings.page,element);
        }
    }
}


function processButton(button: pages.Button, element): when.Promise<void> {
    if(button instanceof pages.ActionButton){
        var action = button.action;
        if (action instanceof pages.MicroflowClientAction) {
            if (action.microflowSettings.microflow != null) {
                return traverseMicroflow(action.microflowSettings.microflow, element);
            }
        }
        else if (action instanceof pages.PageClientAction) {
            if (action.pageSettings.page != null) {
                return traversePage(action.pageSettings.page, element);
            }
        }
    }else if(button instanceof pages.DropDownButton){
        
    }else if(button instanceof pages.NewButton){
        return traversePage(button.pageSettings.page,element);  
    }
}


function traverseMicroflow(microflow: microflows.IMicroflow, element): when.Promise<void> {
    console.log(`Traversing microflow: ${microflow.name}`);
    return loadAsPromise(microflow).then(mf=> {
        //process pages
        mf.objectCollection.objects.filter(o => o instanceof microflows.ShowPageAction).forEach(showPage => {
            var activity = <microflows.ActionActivity>showPage;
            var action = activity.action;
            if (action instanceof microflows.ShowPageAction) {
                element[action.pageSettings.page.name] = {};
                traversePage(action.pageSettings.page, element[action.pageSettings.page.name]);
            }
        });
        //process show hompage action
        mf.objectCollection.objects.filter(o => o instanceof microflows.ShowHomePageAction).forEach(showPage => {
            element[`Show Homepage`] = {};
        });
        //process show microflows
        mf.objectCollection.objects.filter(o => o instanceof microflows.MicroflowCallAction).forEach((mfPara) => {

            var activity = <microflows.ActionActivity>mfPara;
            var action = activity.action;

            if (action instanceof microflows.MicroflowCallAction) {
                element[action.microflowCall.microflow.name] = {};
                traverseMicroflow(action.microflowCall.microflow, element[action.microflowCall.microflow.name]);
            }

        });

    });

}
