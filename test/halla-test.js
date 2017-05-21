'use strict';
const assert = require('assert');
const reverseEngineerYaml = require('../halla').reverseEngineerYaml;
const build = require('../halla').build;

describe('halla', () => {
    describe('reverse engineer yaml', () => {
        it('turns yaml into a javascript object', () => {
            let yaml = `resources:
                        - name: git-repo
                          type: git
                          source: 
                            uri: foo
                        `;
            assert.deepEqual(reverseEngineerYaml(yaml), {
                resources: [{
                    name: 'git-repo',
                    type: 'git',
                    source: {
                        uri: 'foo'
                    }
                }]
            });
        });
        it('turns json into a yaml pipeline', () => {
            let jsonPipeline = {
                resources: [{
                    name: 'git-repo',
                    type: 'git',
                    source: {
                        uri: 'foo'
                    }
                }]
            };
            let expectedYaml = `resources:
  - name: git-repo
    type: git
    source:
      uri: foo
`;
            assert.equal(build(jsonPipeline), expectedYaml);
        })
    });
});
