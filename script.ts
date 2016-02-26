/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch, loadAsPromise } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
var JSONWriter = require('json-writer');
var fs = require('fs');
var ws = fs.createWriteStream('./tmp/mendix.json');
ws.on('close', function() {
    console.log(fs.readFileSync('./tmp/mendix.json', 'UTF-8'));
});
var jw = new JSONWriter(false, function(string, encoding) {
    ws.write(string, encoding);
});

const username = "simon.black@mendix.com";
const apikey = "ba47d0a1-9991-45ee-a14d-d0c1b73d5279";
const projectId = "bce92469-dd44-4414-a7fb-af659a2cee44";
const projectName = "NaturesPrideDemo";
const revNo = -1; // -1 for latest
const branchName = null // null for mainline

const client = new MendixSdkClient(username, apikey);

/*
 * PROJECT TO ANALYZE
 */
const project = new Project(client, projectId, projectName);

client.platform().createOnlineWorkingCopy(project, new Revision(revNo, new Branch(project, branchName)))
    .then(workingCopy => processUserNavigation(workingCopy))
    .done(
    () => {
        
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

function processNavigation(role: security.IUserRole, navDoc: navigation.NavigationDocument): when.Promise<void> {

    let homepage = navDoc.desktopProfile.homePage;
    let usersHomepage = navDoc.desktopProfile.roleBasedHomePages.filter(roleBasedHomepage => roleBasedHomepage.userRole.name === role.name)[0];
    if (usersHomepage != null){    
        if (usersHomepage.page != null) {
            jw.writeElement(usersHomepage.page.name);
            console.log(`${role.name} homepage = ${usersHomepage.page.name}`);
            return traversePage(usersHomepage.page).then(_=>{jw.endElement()});
        } else if (usersHomepage.microflow != null) {
            jw.writeElement(usersHomepage.microflow.name);
            console.log(`${role.name} homepage = ${usersHomepage.microflow.name}`);
            return traverseMicroflow(usersHomepage.microflow).then(_=>{jw.endElement()});
            
        }
    }
};
function processUserNavigation(workingCopy: OnlineWorkingCopy): when.Promise<void> {
    jw.startDocument('1.0', 'UTF-8');
    return loadAsPromise(workingCopy.model().allProjectSecurities()[0]).then(
        projectSecurity => {
            var navigationDoc = workingCopy.model().allNavigationDocuments()[0];
            console.log('Project Security Loaded');
            projectSecurity.userRoles.forEach(role => {
                jw.startElement(role.name);
                
                if(navigationDoc != null){
                    loadAsPromise(navigationDoc).then(
                        navigation => {
                            console.log(`Processing user navigation for: ${role.name}`);
                            processNavigation(role, navigation);
                        }
                    ).then(jw.endElement());
           
            }
        });
        });
}

function traversePage(page: pages.IPage): when.Promise<void> {
    console.log(`Traversing page: ${page.name}`);
    return loadAsPromise(page).then(pageLoaded => {
        jw.writeElement(page.name);
        pageLoaded.traversePublicParts(visit => {
            if (visit instanceof pages.ActionButton) {
                processButton(visit);
            }
        })
    }).then(_=>{jw.endElement()});

}

function processVerticalFlow(verticalFlow: pages.VerticalFlow) {
    verticalFlow.widgets.forEach(widget => {
        if (widget instanceof pages.ActionButton) {
            processButton(widget);
        }
    })
}
function processButton(button: pages.ActionButton): when.Promise<void> {
    var action = button.action;
    if (action instanceof pages.MicroflowClientAction) {
        if(action.microflowSettings.microflow != null){
            return traverseMicroflow(action.microflowSettings.microflow);
        }
    }
    else if (action instanceof pages.PageClientAction) {
        if(action.pageSettings.page != null){
            return traversePage(action.pageSettings.page);
        }
    }
}


function traverseMicroflow(microflow: microflows.IMicroflow): when.Promise<void> {
    console.log(`Traversing microflow: ${microflow.name}`);
    return loadAsPromise(microflow).then(mf=> {
        //process pages
        mf.objectCollection.objects.filter(o => o instanceof microflows.ShowPageAction).forEach(showPage => {
            var activity = <microflows.ActionActivity>showPage;
            var action = activity.action;
            if (action instanceof microflows.ShowPageAction) {
                jw.writeElement(action.pageSettings.page.name);
                traversePage(action.pageSettings.page);
                jw.endElement();
            }
        });
        //process show hompage action
        mf.objectCollection.objects.filter(o => o instanceof microflows.ShowHomePageAction).forEach(showPage => {
            jw.writeElement(`Show Homepage`);
            jw.endElement();
        });
        //process show microflows
        mf.objectCollection.objects.filter(o => o instanceof microflows.MicroflowCallAction).forEach((mfPara) => {

            var activity = <microflows.ActionActivity>mfPara;
            var action = activity.action;

            if (action instanceof microflows.MicroflowCallAction) {
                jw.writeElement(action.microflowCall.microflow.name);
                traverseMicroflow(action.microflowCall.microflow).then(_ =>{jw.endElement();});   
            }

        });

    });

}
