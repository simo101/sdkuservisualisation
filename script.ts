/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts, security } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
var  JSONWriter = require('json-writer');
var jw = new JSONWriter;
const username = "{USER NAME}";
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
    .then(workingCopy => processUserNavigation(workingCopy)
    .then(navigationDoc => processNavigation(navigationDoc))
    .done(
        () => {
            console.log("Done.");
        },
        error => {
            console.log("Something went wrong:");
            console.dir(error);
        }));
 
function loadNavigationDocuments(role: security.UserRole, workingCopy: OnlineWorkingCopy): when.Promise<navigation.NavigationDocument> {
    const navigation = pickNavigationDocument(workingCopy);
    workingCopy.model().allNavigationDocuments().filter[0];
    
    
    return when.promise<navigation.NavigationDocument>((resolve, reject) => {
        navigation.load(nav => resolve(nav));
    });
}
 
function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.NavigationDocument {
    return workingCopy.model().allNavigationDocuments().filter[0];
}

function processNavigation (role: security.UserRole, navDoc: navigation.NavigationDocument): navigation.NavigationDocument {
    
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
    return navDoc;
};
function processUserNavigation(workingCopy: OnlineWorkingCopy){
    jw.startDocument();
    workingCopy.model().allProjectSecurities()[0].userRoles.forEach(role =>{
        jw.startElement(role.name);
        
        loadNavigationDocuments(role);
        jw.endElement();
        
    });
    jw.endDocument();
    
}

function traversePage(page: pages.IPage){
    page.load(pageLoaded =>{
        pageLoaded.layoutCall.load(layout =>{
            layout.
        })
    });
    
}

function traverseMicroflow(microflow: microflows.IMicroflow){
    microflow.load(mf =>{
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
