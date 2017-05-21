'use strict';
const fs = require('fs');
const expect = require('chai').expect;
const waitOn = require('wait-on');
const dockerCompose = require('./docker-compose-runner');
const halla = require('../halla');
const testPipeline = `
resources:
  - name: git-repo
    type: git
    source:
      branch: master
      uri: 'https://github.com/stuartervine/halla.git'
jobs:
  - name: echo-foo
    plan:
      - get: git-repo
        trigger: true
        version: every
      - task: check
        config:
          platform: linux
          image_resource:
            type: docker-image
            source:
              repository: alpine
              tag: latest
          run:
            dir: git-repo
            path: sh
            args:
              - '-ec'
              - echo 'foo'
          inputs:
            - name: git-repo
              path: ''
`;

const expectedImportedPipeline = {
    "groups": [],
    "resources": [{
        "name": "git-repo",
        "type": "git",
        "source": {"branch": "master", "uri": "https://github.com/stuartervine/halla.git"}
    }],
    "resource_types": [],
    "jobs": [{
        "name": "echo-foo",
        "plan": [{"get": "git-repo", "trigger": true, "version": "every"}, {
            "task": "check",
            "config": {
                "platform": "linux",
                "image_resource": {"type": "docker-image", "source": {"repository": "alpine", "tag": "latest"}},
                "run": {"path": "sh", "args": ["-ec", "echo 'foo'"], "dir": "git-repo"},
                "inputs": [{"name": "git-repo", "path": ""}]
            }
        }]
    }]
};

describe('halla', () => {
    before(function(done) {
        this.timeout(60000);
        dockerCompose.up('./test/concourse/docker-compose.yml');
        waitOn({resources: ['http://localhost:8080/api/v1/info']}, (err) => {
            done(err);
        });
});

    after(function() {
        this.timeout(10000);
        dockerCompose.down('./test/concourse/docker-compose.yml');
    });

    it('imports pipelines from concourse', () => {
        return halla.concourse_basic_auth('main', 'http://localhost:8080', 'concourse', 'changeme')
            .then((loggedInConcourse) => loggedInConcourse.publish({name: 'test', yaml: testPipeline}))
            .then((loggedInConcourse) => loggedInConcourse.publish({name: 'test1', yaml: testPipeline}))
            .then((loggedInConcourse) => loggedInConcourse.importAllPipelines('imported_pipelines.js'))
            .then(() => {
                let pipelines = require('../imported_pipelines.js');
                return expect(pipelines['test']).to.deep.equal(expectedImportedPipeline);
            })
            .then(() => {
                let pipelines = require('../imported_pipelines.js');
                return expect(pipelines['test1']).to.deep.equal(expectedImportedPipeline);
            })
            .then(() => {
                fs.unlinkSync('imported_pipelines.js');
            })
    }).timeout(5000);

});
