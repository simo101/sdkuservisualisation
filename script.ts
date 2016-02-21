/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch, loadAsPromise } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
var  JSONWriter = require('json-writer');
var fs = require('fs');
var ws = fs.createWriteStream('/tmp/mendix.json');
ws.on('close', function() {
    console.log(fs.readFileSync('/tmp/mendix.json', 'UTF-8'));
});
var jw = new JSONWriter(false, function(string, encoding) { 
      ws.write(string, encoding);
  });

const username = "";
const apikey = "{API KEY}";
const projectId = "{PROJECT ID}";
const projectName = "{PROJECT NAME}";
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
        
function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.NavigationDocument {
    return workingCopy.model().allNavigationDocuments().filter[0];
}

function processNavigation (role: security.IUserRole, navDoc: navigation.NavigationDocument){
    
    let homepage = navDoc.desktopProfile.homePage;
    let usersHomepage = navDoc.desktopProfile.roleBasedHomePages.filter(roleBasedHomepage => roleBasedHomepage.userRole.name === role.name)[0];

    if (usersHomepage.page != null){
        jw.writeElement(usersHomepage.page.name);
        traversePage(usersHomepage.page);
    }else if(usersHomepage.microflow != null){
        jw.writeElement(usersHomepage.microflow.name);
        traverseMicroflow(usersHomepage.microflow);    
    }
    jw.endElement();
    
};
function processUserNavigation(workingCopy: OnlineWorkingCopy){
    jw.startDocument('1.0', 'UTF-8');
    workingCopy.model().allProjectSecurities()[0].userRoles.forEach(role =>{
        jw.startElement(role.name);
        processNavigation(role,pickNavigationDocument(workingCopy));
        jw.endElement();
    });
    jw.endDocument();
    
}

function traversePage(page: pages.IPage){
    loadAsPromise(page).then(pageLoaded =>{
        loadAsPromise(pageLoaded.layoutCall).then(layout =>{
            var layoutCall = <pages.LayoutCall> layout;
            layoutCall.arguments.forEach(args =>{
                var widget = args.widget; 
                if(widget instanceof pages.VerticalFlow){
                    processVerticalFlow(widget);
                }
                else if(widget instanceof pages.ActionButton){
                    processButton(widget);
                }
                
            });
        })
    });
    
}

function processVerticalFlow(verticalFlow: pages.VerticalFlow){
    verticalFlow.widgets.forEach(widget => {
        if(widget instanceof pages.ActionButton){
           processButton(widget);
        }
    })
}
function processButton(button: pages.ActionButton){
            var action = button.action;
            if(action instanceof pages.MicroflowClientAction){
                traverseMicroflow(action.microflowSettings.microflow);
            }
            else if (action instanceof pages.PageClientAction){
                traversePage(action.pageSettings.page);
            }       
}


function traverseMicroflow(microflow: microflows.IMicroflow){
    loadAsPromise(microflow).then(mf=>{
        //process pages
        mf.objectCollection.objects.filter(o => o instanceof microflows.ShowPageAction).forEach(showPage => {
           var activity = <microflows.ActionActivity> showPage;
           var action = activity.action;
            if(action instanceof microflows.ShowPageAction){
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
              
           var activity = <microflows.ActionActivity> mfPara;
           var action = activity.action;
           
            if(action instanceof microflows.MicroflowCallAction){
               jw.writeElement(action.microflowCall.microflow.name);
               traverseMicroflow(action.microflowCall.microflow);
               jw.endElement();
            }
           
          });
           
        });
        
    }
