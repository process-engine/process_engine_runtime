'use strict';

const fs = require('fs');
const path = require('path');
const should = require('should');
const uuid = require('node-uuid');

const StartCallbackType = require('@process-engine/management_api_contracts').DataModels.ProcessModels.StartCallbackType;

const {ProcessInstanceHandler, TestFixtureProvider} = require('../../dist/commonjs/test_setup');

describe('Metric API Tests - ', () => {

  let processInstanceHandler;
  let testFixtureProvider;

  const processModelId = 'heatmap_sample';
  const correlationId = uuid.v4();

  const expectedMetricsFilePath = path.join('test/metrics', `${processModelId}.met`);

  before(async () => {
    testFixtureProvider = new TestFixtureProvider();
    await testFixtureProvider.initializeAndStart();

    await testFixtureProvider.importProcessFiles([processModelId]);

    processInstanceHandler = new ProcessInstanceHandler(testFixtureProvider);

    await createFinishedProcessInstance();
  });

  after(async () => {
    await testFixtureProvider.tearDown();
  });

  it('should write metrics to the expected filepath, using the ProcessModelId as filename.', async () => {
    const metricsAreAtExpectedLocation = fs.existsSync(expectedMetricsFilePath);
    should(metricsAreAtExpectedLocation).be.true(`The metrics were not writen to the expected path '${expectedMetricsFilePath}'!`);
  });

  it('should properly format the metrics when writing them to the file and place each entry to a new line', () => {
    const metrics = readMetricsFile();
    const metricsAreProperlyFormatted = Array.isArray(metrics) && metrics.length > 1;
    should(metricsAreProperlyFormatted).be.true('The metrics are not properly separated by a newline!');
  });

  it('should write entries for each stage of the ProcessModels execution', () => {
    const metrics = readMetricsFile();

    const expectedEntryForProcessStarted = /heatmap_sample.*?onProcessStart/i;
    const expectedEntryForProcessFinished = /heatmap_sample.*?onProcessFinish/i;

    const processStartWasMeasured = metrics.some((entry) => {
      return entry.match(expectedEntryForProcessStarted);
    });
    should(processStartWasMeasured).be.equal(true, 'No process-start metrics were created for ProcessModel \'heatmap_sample\'!');

    const processFinishWasMeasured = metrics.some((entry) => {
      return entry.match(expectedEntryForProcessFinished);
    });

    should(processFinishWasMeasured).be.equal(true, 'No process-finished metrics were created for ProcessModel \'heatmap_sample\'!');
  });

  it('should write entries for each state change of each FlowNodeInstance', () => {
    const metrics = readMetricsFile();

    const expectedMessages = [
      'onFlowNodeEnter',
      'onFlowNodeExit',
    ];

    const expectedFlowNodeEntries = [
      'StartEvent_1',
      'ExclusiveGateway_0fi1ct7',
      'ScriptTask_1',
      'ServiceTask_1',
      'ExclusiveGateway_134ybqm',
      'EndEvent_0eie6q6',
    ];

    for (const flowNodeName of expectedFlowNodeEntries) {
      for (const message of expectedMessages) {

        const expectedMetricEntry = new RegExp(`heatmap_sample.*?${flowNodeName}.*?${message}`, 'i');

        const metricHasMatchingEntry = metrics.some((entry) => {
          return entry.match(expectedMetricEntry);
        });

        should(metricHasMatchingEntry).be.equal(true, `No '${message}' type metrics were created for FlowNode ${flowNodeName}!`);
      }
    }
  });

  async function createFinishedProcessInstance() {

    const payload = {
      correlationId: correlationId,
      inputValues: {
        user_task: false,
      },
    };

    const returnOn = StartCallbackType.CallbackOnProcessInstanceFinished;

    await testFixtureProvider
      .managementApiClient
      .startProcessInstance(testFixtureProvider.identities.defaultUser, processModelId, payload, returnOn);
  }

  function readMetricsFile() {

    // Don't parse anything here. Leave that to the tests of the logging service, where it belongs.
    const fileContent = fs.readFileSync(expectedMetricsFilePath, 'utf-8');

    const metrics = fileContent.split('\n');

    const metricsWithoutEmptyLines = metrics.filter((entry) => {
      return entry.length > 1; // final empty line length will be 1, because of the \n.
    });

    return metricsWithoutEmptyLines;
  }
});
