/// <reference path='./typings/tsd.d.ts' />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts } from "mendixmodelsdk";
import when = require('when');
//const readlineSync = require('readline-sync');

/*
 * CREDENTIALS
 */
const JSONWriter = require('json-writer');
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
    .then(workingCopy => loadNavigationDocuments(workingCopy)
    .then(navigationDoc => processNavigation(navigationDoc))
    .done(
        () => {
            console.log("Done.");
        },
        error => {
            console.log("Something went wrong:");
            console.dir(error);
        }));
 
function loadNavigationDocuments(workingCopy: OnlineWorkingCopy): when.Promise<navigation.NavigationDocument> {
    const navigation = pickNavigationDocument(workingCopy);
    return when.promise<navigation.NavigationDocument>((resolve, reject) => {
        navigation.load(nav => resolve(nav));
    });
}
 
function pickNavigationDocument(workingCopy: OnlineWorkingCopy): navigation.NavigationDocument {
    return workingCopy.model().allNavigationDocuments().filter[0];
}

function processNavigation (navDoc: navigation.NavigationDocument): navigation.NavigationDocument {
    
    let homepage = navDoc.desktopProfile.homePage;
    navDoc.desktopProfile.roleBasedHomePages.forEach(roleBasedHomepage => {
        let userRoleName = roleBasedHomepage.userRole.name;
        let rolePage = roleBasedHomepage.page;
        let roleMicroflow = roleBasedHomepage.microflow;
        
    }
    );
    if (homepage.page != null){
        var homepagePage = homepage.page;
    }else if(homepage.microflow != null){    
    }
    else{
        
    }
    return navDoc;
};
function userRoles(workingCopy: OnlineWorkingCopy){
    workingCopy.model().allProjectSecurities()[0].userRoles.forEach(role =>{
        
        jw.startDocument().startElement(role.name);
    }
    )
}

function traverseMicroflow(microflow: microflows.Microflow){
    microflow.objectCollection.objects.filter(o => o instanceof microflows.ShowPageAction || o instanceof microflows.ShowHomePageAction ).forEach((o) => {
        
    });
    microflow.objectCollection.objects.filter(o => o instanceof microflows.MicroflowParameter).forEach((o) => { 
    });
}