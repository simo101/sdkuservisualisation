# SDK User Visualisation
## Setup
To set up and use the sdk you need to have node js installed on your machine.
Open up the folder using node.js.
To install the sdkuservisualisation you should type the command:

`npm install`

This is will install the sdk visualisation and all the relevant dependencies.
To connect it to your project you need to change the following constants in the `script.ts`

`var username = "{{Username}}";`

`var apikey = "{{ApiKey}}";`

`var projectId = "{{ProjectId}}";`

`var projectName = "{{ProjectName}}";`

API keys can be found in the mendix home portal.

## Use the visualisation
Once the visualiser is installed type:
`tsc`
to compile the visualisation code.

Then after compiled type:
`node script.js`

This will start running the script. Once the script has completed visualising your project it will load up a browser to display the visualisation.

<img src="img/visualisation.png></img>
