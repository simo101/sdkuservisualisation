/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch, loadAsPromise } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security, IStructure, menus } from "mendixmodelsdk";
import when = require('when');
var fs = require('fs');
var ws = fs.createWriteStream('./web/mendix.json');

const jsonObj = {};

const username = "{{Username}}";
const apikey = "{{ApiKey}}";
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

/**
* This function picks the first navigation document in the project.
*/
function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.INavigationDocument {
    return workingCopy.model().allNavigationDocuments()[0];
}
/**
* This function processes a given user navigation
*/
function processNavigation(role: security.UserRole, navDoc: navigation.NavigationDocument, element): when.Promise<void> {
    let usersHomepage = navDoc.desktopProfile.roleBasedHomePages.filter(roleBasedHomepage => roleBasedHomepage.userRole.name === role.name)[0];
    if (usersHomepage != null) {
        if (usersHomepage.page != null) {
            console.log(`${role.name} homepage = ${usersHomepage.page.name}`);
            return loadAsPromise(usersHomepage.page).then(pg => processStructures(element, pg, role, false)).then(_ => {
                return processOtherNavigation(navDoc, element, role);
            });
        } else if (usersHomepage.microflow != null) {
            console.log(`${role.name} homepage = ${usersHomepage.microflow.name}`);
            return loadAsPromise(usersHomepage.microflow).then(mf => traverseMicroflow(mf, element, role)).then(_ => {
                return processOtherNavigation(navDoc, element, role);
            });
        }
        else {
            return;
        }
    } else {
        let defaultHomepage = navDoc.desktopProfile.homePage;
        if (defaultHomepage != null) {
            if (defaultHomepage.page != null) {
                console.log(`${role.name} homepage = ${defaultHomepage.page.name}`);
                return loadAsPromise(defaultHomepage.page).then(pg => processStructures(element, pg, role, false)).then(_ => {
                    return processOtherNavigation(navDoc, element, role);
                });
            } else if (defaultHomepage.microflow != null) {
                console.log(`${role.name} homepage = ${defaultHomepage.microflow.name}`);
                return loadAsPromise(defaultHomepage.microflow).then(mf => traverseMicroflow(mf, element, role)).then(_ => {
                    return processOtherNavigation(navDoc, element, role);
                });
            }
            else {
                return;
            }
        } else {
            return;
        }
    };
}
/**
* This function processes the other users navigation
*/
function processOtherNavigation(navDoc: navigation.NavigationDocument, element, userRole): when.Promise<void> {
    var items = navDoc.desktopProfile.menuItemCollection.items;
    if (items != null) {
        return when.all<void>(items.map(item => processItem(item, element, userRole)));
    }
    else {
        return;
    }
}
/**
* This function processes a menu item.
*/
function processItem(item: menus.MenuItem, element, role: security.UserRole): when.Promise<void> {
    var action = item.action;
    if (action != null) {
        if (action instanceof pages.PageClientAction) {
            if (action.pageSettings.page != null) {
                return loadAsPromise(action.pageSettings.page).then(pg => processStructures(element, pg, role, false));
            } else {
                return;
            }
        } else if (action instanceof pages.MicroflowClientAction) {
            if (action.microflowSettings.microflow != null) {
                return loadAsPromise(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, role));
            } else {
                return;
            }
        }
    } else {
        return;
    }
}

/**
* This function loads the project security.
*/
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
/**
* This function loads all the users navigation
*/
function loadAllUserNavigation(userRoles: security.UserRole[]): when.Promise<security.UserRole[]> {
    jsonObj[`name`] = "User Roles";
    jsonObj[`children`] = [];
    jsonObj[`parent`] = null;
    return when.all<security.UserRole[]>(userRoles.map(processUsersNavigation));
}
function getAllUserRoles(projectSecurity: security.ProjectSecurity): security.UserRole[] {
    return projectSecurity.userRoles;
}
/**
* This function processes the navigation for a given user.
*/
function processUsersNavigation(role: security.UserRole): when.Promise<void> {
    var nav = role.model.allNavigationDocuments()[0];
    var child = { name: role.name, children: [], parent: "User Roles" };
    jsonObj[`children`].push(child);
    console.log(`Processing user navigation for: ${role.name}`);
    if (nav != null) {
        return loadAsPromise(nav).then(loadedNav => processNavigation(role, loadedNav, child));
    } else {
        return;
    }
}

/**
* Traverses a given structure and returns all buttons, controlbar buttons and listviews
*/
function getStructures(structure: IStructure): IStructure[] {

    var structures = [];
    structure.traverse(function(structure) {
        if (structure instanceof pages.Button || structure instanceof pages.ControlBarButton || structure instanceof pages.ListView || structure instanceof pages.SnippetCallWidget) {
            structures.push(structure);
        }
    });
    return structures;
}

/**
* This function processes a button and adds it to the jsonObj.
*/
function processStructures(element, page: pages.Page, userRole: security.UserRole, calledFromMicroflow: boolean): when.Promise<void> {
    if (page != null) {
        if (calledFromMicroflow) {
            var structures = getStructures(page);
            if (!checkIfInElement(page.name, element)) {
                var child = { name: page.name, children: [], parent: element.name };
                element["children"].push(child);
                if (structures.length > 0) {
                    return when.all<void>(structures.map(strut => traverseElement(child, strut, userRole)));
                } else {
                    return;
                }
            }
        } else {
            if (checkPageSecurity(page, userRole)) {
                var structures = getStructures(page);
                if (!checkIfInElement(page.name, element)) {
                    var child = { name: page.name, children: [], parent: element.name };
                    element["children"].push(child);
                    if (structures.length > 0) {
                        return when.all<void>(structures.map(strut => traverseElement(child, strut, userRole)));
                    } else {
                        return;
                    }
                }
                else {
                    return;
                }
            } else {
                return;
            }
        }

    } else {
        return;
    }
}
/**
* This function traverses a page element
*/
function traverseElement(element, structure: IStructure, userRole: security.UserRole): when.Promise<void> {
    if (structure != null) {
        if (structure instanceof pages.Button) {
            return processButton(structure, element, userRole);
        } else if (structure instanceof pages.ControlBarButton) {
            return processControlBarButton(structure, element, userRole);
        } else if (structure instanceof pages.ListView) {
            return processListView(structure, element, userRole);
        } else if (structure instanceof pages.SnippetCallWidget) {
            return processSnippet(structure, element, userRole);
        }
    } else {
        return;
    }
}
/**
 * This Function processes the listview structure.
 */
function processListView(listView: pages.ListView, element, userRole: security.UserRole): when.Promise<void> {
    if (listView.clickAction != null) {
        var action = listView.clickAction;
        if (action instanceof pages.MicroflowClientAction) {
            if (action.microflowSettings.microflow != null) {
                return loadAsPromise(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, userRole));
            } else {
                return;
            }
        } else if (action instanceof pages.PageClientAction) {
            if (action.pageSettings.page != null) {
                return loadAsPromise(action.pageSettings.page).then(pg => processStructures(element, pg, userRole, false));
            } else {
                return;
            }
        } else {
            return;
        }
    } else {
        return;
    }
}

function processSnippet(snippetCallWidget: pages.SnippetCallWidget, element, userRole: security.UserRole): when.Promise<void> {
    if (snippetCallWidget != null) {
        var snippetCall = snippetCallWidget.snippetCall;
        if (snippetCall != null) {
            var snippet = snippetCall.snippet;
            if (snippet != null) {
                return loadAsPromise(snippet).then(snip => processSnippetStructures(element,userRole,snip));
            } else {
                return;
            }
        } else {
            return;
        }
    } else {
        return;
    }

}

/**
 * Process snippet Structures
 */
function processSnippetStructures(element, userRole: security.UserRole,snip:pages.Snippet): when.Promise<void> {
    var structures = getStructures(snip);
    if (structures.length > 0) {
        return when.all<void>(structures.map(strut => traverseElement(element, strut, userRole)));
    } else {
        return;
    }
}

/**
* This function is used to process a control bar button
*/
function processControlBarButton(button: pages.ControlBarButton, element, userRole: security.UserRole): when.Promise<void> {
    if (button instanceof pages.GridEditButton) {
        if (button.pageSettings.page != null) {
            return loadAsPromise(button.pageSettings.page).then(pg => processStructures(element, pg, userRole, false));
        } else {
            return;
        }
    } else if (button instanceof pages.DataViewActionButton) {
        var action = button.action;
        if (action != null) {
            if (action instanceof pages.MicroflowClientAction) {
                if (action.microflowSettings.microflow != null) {
                    return loadAsPromise(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, userRole));
                }
                else {
                    return;
                }
            } else if (action instanceof pages.PageClientAction) {
                if (action.pageSettings.page != null) {
                    return loadAsPromise(action.pageSettings.page).then(pg => processStructures(element, pg, userRole, false));
                } else {
                    return;
                }
            }
        }
        else {
            return;
        }
    }
}

/**
* This function is used to processes a button found on a page. Depending on the button type it will process the button differently.
*/
function processButton(button: pages.Button, element, userRole: security.UserRole): when.Promise<void> {
    if (button instanceof pages.ActionButton) {
        var action = button.action;
        if (action != null) {
            if (action instanceof pages.MicroflowClientAction) {
                if (action.microflowSettings.microflow != null) {
                    return loadAsPromise(action.microflowSettings.microflow).then(mf => traverseMicroflow(mf, element, userRole));
                }
            }
            else if (action instanceof pages.PageClientAction) {
                if (action.pageSettings.page != null) {
                    return loadAsPromise(action.pageSettings.page).then(pg => processStructures(element, pg, userRole, true));
                }
            }
        } else {
            return;
        }
    } else if (button instanceof pages.DropDownButton) {

    } else if (button instanceof pages.NewButton) {
        return loadAsPromise(button.pageSettings.page).then(pg => {
            var entity = button.entity;
            if (entity != null) {
                loadAsPromise(entity).then(ent => {
                    if (checkEntitySecurityCanCreate(ent, userRole)) {
                        return processStructures(element, pg, userRole, false);
                    } else {
                        return;
                    }
                });
            } else {
                return;
            }

        });

    }
}
/**
* This function traverses all the microflow actions that are passed to it and returns once all actions are processed.
*/
function traverseMicroflowActions(actions: microflows.IMicroflowObject[], element, userRole: security.UserRole): when.Promise<void> {
    return when.all<void>(actions.map(act => processAction(act, element, userRole)));
}
/**
* This function checks what the type of microflow action is either a show page, show homepage or microflow call. Then processes accordingly.
*/
function processAction(mfObj: microflows.IMicroflowObject, element, userRole: security.UserRole): when.Promise<void> {
    if (mfObj instanceof microflows.ActionActivity) {

        var action = mfObj.action;
        if (action != null) {
            if (action instanceof microflows.ShowPageAction) {
                console.log(`Microflow action to open page ${action.pageSettings.page.name}`);
                if (action.pageSettings.page != null) {
                    return loadAsPromise(action.pageSettings.page).then(pg => processStructures(element, pg, userRole, true));
                } else {
                    return;
                }
            }
            else if (action instanceof microflows.ShowHomePageAction) {
                var child = { name: "ShowHomepage", children: [], parent: element.name };
                element["children"].push(child);
                return;
            } else if (action instanceof microflows.MicroflowCallAction) {
                console.log(`Microflow action to open microflow ${action.microflowCall.microflow.name}`);
                if (action.microflowCall.microflow != null) {
                    return loadAsPromise(action.microflowCall.microflow).then(mf => traverseMicroflow(mf, element, userRole));
                } else {
                    return;
                }
            }
        } else {
            return;
        }

    }
}
/**
* This function traverses a microflow to find all actions that either open up a page or sub microflow
*/
function traverseMicroflow(microflow: microflows.Microflow, element, userRole: security.UserRole): when.Promise<void> {
    if (checkMicroflowSecurity(microflow, userRole)) {
        console.log(`Traversing Microflow for: ${microflow.name}`);
        if (!checkIfInElement(microflow.name, element)) {
            var child = { name: microflow.name, children: [], parent: element.name };
            element["children"].push(child);
            return traverseMicroflowActions(microflow.objectCollection.objects.filter(o => o instanceof microflows.ActionActivity), child, userRole);
        } else {
            return;
        }
    } else {
        return;
    }

}

/**
* This function checks to see if the given user role has access to the given page.
*/
function checkPageSecurity(page: pages.Page, userRole: security.UserRole): boolean {
    var moduleRolesAllowed = page.allowedRolesQualifiedNames;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    var i;
    var a;
    for (i = 0; i < moduleRolesAllowed.length; i++) {
        for (a = 0; a < userRolesModuleRoles.length; a++) {
            if (userRolesModuleRoles[a] === moduleRolesAllowed[i]) {
                return true;
            }
        }
    }
    return false;
}

/**
* This function checks whether the given role is able to execute the given microflow.
*/
function checkMicroflowSecurity(microflow: microflows.Microflow, userRole: security.UserRole): boolean {
    var moduleRolesAllowed = microflow.allowedModuleRolesQualifiedNames;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    var i;
    var a;
    for (i = 0; i < moduleRolesAllowed.length; i++) {
        for (a = 0; a < userRolesModuleRoles.length; a++) {
            if (userRolesModuleRoles[a] === moduleRolesAllowed[i]) {
                return true;
            }
        }
    }
    return false;
}


/**
* This function checks to see whether a given user role is able to create the given entity.
*/
function checkEntitySecurityCanCreate(entity: domainmodels.Entity, userRole: security.UserRole): boolean {
    var accessRules = entity.accessRules;
    var userRolesModuleRoles = userRole.moduleRolesQualifiedNames;
    var i, a, b;
    for (i = 0; i < userRolesModuleRoles.length; i++) {
        for (a = 0; a < accessRules.length; a++) {
            for (b = 0; b < accessRules[a].moduleRoles.length; b++) {
                if (userRolesModuleRoles[i] === accessRules[a].moduleRoles[b].qualifiedName) {
                    if (accessRules[i].allowCreate) {
                        return true;
                    }

                }
            }
        }
    }
    return false;
}

/**
* This function checks to see if the user role has access to delete the given entity.
*/
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

/**
* This function checks to see if the new element already exists in the jsonObj.
* Returns true if the element exists as a parent of the current element.
* This function also checks to see if it exists a child already.
*/
function checkIfInElement(newElement: String, element): boolean {
    if (element.parent === newElement || checkIfInChildren(newElement, element)) {
        return true;
    }
    return false;
}

function checkIfInChildren(newElement: String, element): boolean {
    var i;
    for (i = 0; i < element.children.length; i++) {
        if (element.children[i].name === newElement) {
            return true;
        }
    }
    return false;
}