halla

A simple library to help you create concourse pipelines using Javascript (and hence composition).

Installation:

~~~
npm install --save halla
~~~

Usage:

~~~
const halla = require('halla');
~~~

To extract all of your current pipelines into a javascript file:

~~~
const halla = require('halla');

halla.concourse('target', 'concourse-url', 'team-name')
    .then((logged_in_concourse) => {
        logged_in_concourse.importAllPipelines('imported-pipelines.js');
    });
~~~

To build a pipeline from the javascript version:

~~~
const pipeline_yml = halla.build({ ... your javascript pipeline object ... });
~~~

To publish a pipeline to your concourse server:

~~~
const pipeline_yml = halla.build({ ... your javascript pipeline object ... });

halla.concourse('target', 'concourse-url', 'team-name')
    .then((logged_in_concourse) => {
        logged_in_concourse.publish('my-awesome-pipeline', pipeline_yml);
    });
~~~