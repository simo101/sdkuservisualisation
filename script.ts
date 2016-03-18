/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch, loadAsPromise } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security, IStructure, menus } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
var fs = require('fs');
var ws = fs.createWriteStream('./web/mendix.json');

const jsonObj = {};

const username = "{{Username}}";
const apikey = "{{ApKey}}";
const projectId = "{{ProjectID}}";
const projectName = "{{ProjectName}}";
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

    .then(
    () => {
        var jsonString = JSON.stringify(jsonObj);
        ws.write(jsonString);
        ws.end();
        console.log("Done.");
    }).done(

    () => {
        var connect = require('connect');
        var serveStatic = require('serve-static');
        connect().use(serveStatic(__dirname)).listen(8000, function() {
            console.log('Server running on 8000...');
        });
        var openurl = require('openurl').open;
        openurl("http://localhost:8000/web/");
    },
    error => {
        console.log("Something went wrong:");
        console.dir(error);
    }
    );



function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.INavigationDocument {
    return workingCopy.model().allNavigationDocuments()[0];
}

function processNavigation(role: security.UserRole, navDoc: navigation.NavigationDocument, element): when.Promise<void> {
    let usersHomepage = navDoc.desktopProfile.roleBasedHomePages.filter(roleBasedHomepage => roleBasedHomepage.userRole.name === role.name)[0];
    if (usersHomepage != null) {
        if (usersHomepage.page != null) {
            console.log(`${role.name} homepage = ${usersHomepage.page.name}`);
            return loadPage(usersHomepage.page).then(pg => processButtons(element, pg, role)).then(_ => {
                return processOtherNavigation(navDoc, element, role);
            });
        } else if (usersHomepage.microflow != null) {
            console.log(`${role.name} homepage = ${usersHomepage.microflow.name}`);
            return loadMicroflow(usersHomepage.microflow).then(mf => traverseMicroflow(mf, element, role)).then(_ => {
                return processOtherNavigation(navDoc, element, role);
            });
        }
    }
};

function processOtherNavigation(navDoc: navigation.NavigationDocument, element, userRole): when.Promise<void> {
    var items = navDoc.desktopProfile.menuItemCollection.items;
    return when.all<void>(items.map(item => processItem(item, element, userRole)));
}

function processItem(item: menus.MenuItem, element, role: security.UserRole): when.Promise<void> {
    var action = item.action;
    if (action instanceof pages.PageClientAction) {
        return loadPage(action.pageSettings.page).then(pg => processButtons(element, pg, role))
    } else if (action instanceof pages.MicroflowClientAction) {
        return loadMicroflow(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, role));
    }
}

function loadProjectSecurity(workingCopy: OnlineWorkingCopy): when.Promise<security.ProjectSecurity> {
    var security = workingCopy.model().allProjectSecurities()[0];
    return when.promise<security.ProjectSecurity>((resolve, reject) => {
        if (security) {
            security.load(secure => {
                if (secure) {
                    console.log(`Loaded security`);
                    resolve(secure);
                } else {
                    console.log(`Failed to load security`);
                    reject(`Failed to load security`);
                }
            });
        } else {
            reject(`'security' is undefined`);
        }
    });
}

function loadAllUserNavigation(userRoles: security.UserRole[]): when.Promise<security.UserRole[]> {
    jsonObj[`name`] = "User Roles";
    jsonObj[`children`] = [];
    return when.all<security.UserRole[]>(userRoles.map(processUsersNavigation));
}
function getAllUserRoles(projectSecurity: security.ProjectSecurity): security.UserRole[] {
    return projectSecurity.userRoles;
}

function processUsersNavigation(role: security.UserRole): when.Promise<void> {
    var nav = role.model.allNavigationDocuments()[0];
    var child = { name: role.name, children: [] };
    jsonObj[`children`].push(child);
    console.log(`Processing user navigation for: ${role.name}`);
    return loadNavigation(nav).then(loadedNav => processNavigation(role, loadedNav, child));
}

function loadNavigation(nav: navigation.INavigationDocument): when.Promise<navigation.NavigationDocument> {
    return when.promise<navigation.NavigationDocument>((resolve, reject) => {
        if (nav) {
            nav.load(navDoc => {
                if (navDoc) {
                    console.log(`Loaded navDoc`);
                    resolve(navDoc);
                } else {
                    console.log(`Failed to load navDoc`);
                    reject(`Failed to load navDoc`);
                }
            });
        } else {
            reject(`'nav' is undefined`);
        }
    });
}

function loadPage(page: pages.IPage): when.Promise<pages.Page> {
    return when.promise<pages.Page>((resolve, reject) => {
        if (page) {
            console.log(`Loading page: ${page.qualifiedName}`);
            page.load(mf => {
                if (mf) {
                    console.log(`Loaded page: ${page.qualifiedName}`);
                    resolve(mf);
                } else {
                    console.log(`Failed to load page: ${page.qualifiedName}`);
                    reject(`Failed to load page: ${page.qualifiedName}`);
                }
            });
        } else {
            reject(`'page' is undefined`);
        }
    });
}

function getStructures(pageLoaded: pages.Page, element): IStructure[] {

    var buttons = [];
    pageLoaded.traverse(function(structure) {
        if (structure instanceof pages.Button || structure instanceof pages.ControlBarButton) {
            buttons.push(structure);
        }
    });
    return buttons;
}

function processButtons(element, page: pages.Page, userRole: security.UserRole): when.Promise<void> {
    if (checkPageSecurity(page, userRole)) {
        var buttons = getStructures(page, element);
        var child = { name: page.name, children: [] };
        element["children"].push(child);
        return when.all<void>(buttons.map(btn => traverseElement(child, btn, userRole)));
    } else {
        return;
    }

}

function traverseElement(element, structure: IStructure, userRole: security.UserRole): when.Promise<void> {
    if (structure != null) {
        if (structure instanceof pages.Button) {
            return processButton(structure, element, userRole);
        } else if (structure instanceof pages.ControlBarButton) {
            return processControlBarButton(structure, element, userRole);
        }
    }
}

function processControlBarButton(button: pages.ControlBarButton, element, userRole: security.UserRole): when.Promise<void> {
    if (button instanceof pages.GridEditButton) {
        return loadPage(button.pageSettings.page).then(pg => processButtons(element, pg, userRole));
    } else if (button instanceof pages.DataViewActionButton) {
        var action = button.action;
        if (action instanceof pages.MicroflowClientAction) {
            return loadMicroflow(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, userRole));
        } else if (action instanceof pages.PageClientAction) {
            return loadPage(action.pageSettings.page).then(pg => processButtons(element, pg, userRole));
        }
    }
}


function processButton(button: pages.Button, element, userRole: security.UserRole): when.Promise<void> {
    if (button instanceof pages.ActionButton) {
        var action = button.action;
        if (action instanceof pages.MicroflowClientAction) {
            if (action.microflowSettings.microflow != null) {
                return loadMicroflow(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, userRole));
            }
        }
        else if (action instanceof pages.PageClientAction) {
            if (action.pageSettings.page != null) {
                return loadPage(action.pageSettings.page).then(pg => processButtons(element, pg, userRole));
            }
        }
    } else if (button instanceof pages.DropDownButton) {

    } else if (button instanceof pages.NewButton) {
        return loadPage(button.pageSettings.page).then(pg => processButtons(element, pg, userRole));
    }
}

function traverseMicroflowActions(actions: microflows.IMicroflowObject[], element, userRole: security.UserRole): when.Promise<void> {
    return when.all<void>(actions.map(act => processAction(act, element, userRole)));
}

function processAction(mfObj: microflows.IMicroflowObject, element, userRole: security.UserRole): when.Promise<void> {
    if (mfObj instanceof microflows.ActionActivity) {

        var action = mfObj.action;
        if (action instanceof microflows.ShowPageAction) {
            console.log(`microflow action to open page ${action.pageSettings.page}`);
            return loadPage(action.pageSettings.page).then(pg => processButtons(element, pg, userRole));
        }
        else if (action instanceof microflows.ShowHomePageAction) {
            var child = { name: "ShowHomepage", children: [] };
            element["children"].push(child);
            return;
        } else if (action instanceof microflows.MicroflowCallAction) {
            console.log(`microflow action to open microflow ${action.microflowCall.microflow.name}`);
            return loadMicroflow(action.microflowCall.microflow).then(mf => traverseMicroflow(mf, element, userRole));
        }
    }
}


function loadMicroflow(microflow: microflows.IMicroflow): when.Promise<microflows.Microflow> {
    return when.promise<microflows.Microflow>((resolve, reject) => {
        if (microflow) {
            console.log(`Loading microflow: ${microflow.qualifiedName}`);
            microflow.load(mf => {
                if (mf) {
                    console.log(`Loaded microflow: ${microflow.qualifiedName}`);
                    resolve(mf);
                } else {
                    console.log(`Failed to load microflow: ${microflow.qualifiedName}`);
                    reject(`Failed to load microflow: ${microflow.qualifiedName}`);
                }
            });
        } else {
            reject(`'microflow' is undefined`);
        }
    });
}

function traverseMicroflow(microflow: microflows.Microflow, element, userRole: security.UserRole): when.Promise<void> {
    if (checkMicroflowSecurity(microflow, userRole)) {
        console.log(`Traversing Microflow for: ${microflow.name}`);
        var child = { name: microflow.name, children: [] };
        element["children"].push(child);
        return traverseMicroflowActions(microflow.objectCollection.objects.filter(o => o instanceof microflows.ActionActivity), child, userRole);
    } else {
        return;
    }

}

function checkPageSecurity(page: pages.Page, userRole: security.UserRole): boolean {
    var moduleRolesAllowed = page.allowedRolesQualifiedNames;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    moduleRolesAllowed.forEach(role => {
        if (userRolesModuleRoles.filter(usersModuleRole => usersModuleRole === role).length >= 1) {
            return true;
        }
    });
    return true;
}
function checkMicroflowSecurity(microflow: microflows.Microflow, userRole: security.UserRole): boolean {
    var moduleRolesAllowed = microflow.allowedModuleRolesQualifiedNames;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    moduleRolesAllowed.forEach(role => {
        if (userRolesModuleRoles.filter(usersModuleRole => usersModuleRole === role).length >= 1) {
            return true;
        }
    });
    return true;
}

function checkEntitySecurityCanCreate(entity: domainmodels.Entity, userRole: security.UserRole): boolean {
    var accessRules = entity.accessRules;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    userRolesModuleRoles.forEach(role => {
        var filteredAccessRules = accessRules.filter(accessRule => accessRule.moduleRoles.filter(moduleRole => moduleRole.qualifiedName === role).length >= 1)
        filteredAccessRules.forEach(filteredAccessRule => {
            if (filteredAccessRule.allowCreate) {
                return true;
            }
        });
    });
    return false;
}

function checkEntitySecurityCanDelete(entity: domainmodels.Entity, userRole: security.UserRole): boolean {
    var accessRules = entity.accessRules;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    userRolesModuleRoles.forEach(role => {
        var filteredAccessRules = accessRules.filter(accessRule => accessRule.moduleRoles.filter(moduleRole => moduleRole.qualifiedName === role).length >= 1)
        filteredAccessRules.forEach(filteredAccessRule => {
            if (filteredAccessRule.allowDelete) {
                return true;
            }
        });
    });
    return false;
}