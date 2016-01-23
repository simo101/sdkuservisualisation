/// <reference path='./typings/tsd.d.ts' />
  
import {MendixSdkClient, Project, OnlineWorkingCopy} from 'mendixplatformsdk';
import {IModel, domainmodels} from 'mendixmodelsdk';
import when = require('when');
import cred = require("./credentials");
  
const username = cred.Credentials.username;
const apikey = cred.Credentials.apikey
const client = new MendixSdkClient(username, apikey);
 
client.platform().createNewApp(`NewApp-${Date.now() }`)
    .then(project => project.createWorkingCopy())
    .then(workingCopy => loadDomainModel(workingCopy))
    .then(workingCopy => {
        const dm = pickDomainModel(workingCopy);
        const domainModel = dm.load();
        let entity = domainmodels.Entity.createIn(domainModel);
        entity.name = `NewEntity_${Date.now() }`;
        entity.location = { x: 100, y: 100 };
        return workingCopy;
    })
    .then(workingCopy => workingCopy.commit())
    .done(
        revision => console.log(`Successfully committed revision: ${revision.num() }. Done.`),
        error => {
            console.log('Something went wrong:');
            console.dir(error);
        });
 
function loadDomainModel(workingCopy: OnlineWorkingCopy): when.Promise<OnlineWorkingCopy> {
    const dm = pickDomainModel(workingCopy);
    return when.promise<OnlineWorkingCopy>((resolve, reject) => {
        dm.load(dm => resolve(workingCopy));
    });
}
 
function pickDomainModel(workingCopy: OnlineWorkingCopy): domainmodels.IDomainModel {
    return workingCopy.model().allDomainModels()
        .filter(dm => dm.qualifiedName === 'MyFirstModule')[0];
}