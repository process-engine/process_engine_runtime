'use strict';

const moment = require('moment');
const should = require('should');
const uuid = require('uuid');

const ProcessInstanceHandler = require('../../dist/commonjs').ProcessInstanceHandler;
const TestFixtureProvider = require('../../dist/commonjs').TestFixtureProvider;

describe('ExternalTask API:   POST  ->  /worker/:worker_id/fetch_and_lock', () => {

  let processInstanceHandler;
  let testFixtureProvider;

  let defaultIdentity;
  let restrictedIdentity;
  let externalTaskIdToCleanupAfterTest;

  const processModelId = 'external_task_sample';
  const workerId = 'fetch_and_lock_sample_worker';
  const topicName = 'external_task_sample_topic';

  before(async () => {
    testFixtureProvider = new TestFixtureProvider();
    await testFixtureProvider.initializeAndStart();

    defaultIdentity = testFixtureProvider.identities.defaultUser;
    restrictedIdentity = testFixtureProvider.identities.restrictedUser;

    await testFixtureProvider.importProcessFiles([processModelId]);

    processInstanceHandler = new ProcessInstanceHandler(testFixtureProvider);
  });

  after(async () => {

    await testFixtureProvider
      .externalTaskApiClientService
      .finishExternalTask(defaultIdentity, workerId, externalTaskIdToCleanupAfterTest, {});

    await testFixtureProvider.tearDown();
  });

  it('should successfully return an empty Array, if no ExternalTask is available for Processing', async () => {

    const availableExternalTasks = await testFixtureProvider
      .externalTaskApiClientService
      .fetchAndLockExternalTasks(defaultIdentity, workerId, topicName, 1, 0, 10000);

    should(availableExternalTasks).be.an.Array();
    should(availableExternalTasks.length).be.equal(0);
  });

  it('should successfully get a list of ExternalTasks, if there is at least one ExternalTask available', async () => {

    await createWaitingExternalTask();

    const availableExternalTasks = await testFixtureProvider
      .externalTaskApiClientService
      .fetchAndLockExternalTasks(defaultIdentity, workerId, topicName, 1, 0, 10000);

    should(availableExternalTasks).be.an.Array();
    should(availableExternalTasks.length).be.equal(1);

    const externalTask = availableExternalTasks[0];

    externalTaskIdToCleanupAfterTest = externalTask.id;

    should(externalTask.workerId).be.equal(workerId);
    should(externalTask.topic).be.equal(topicName);
    should(externalTask.state).be.equal('pending');

    should.not.exist(externalTask.finishedAt);

    const now = moment();
    const lockExpirationTime = moment(externalTask.lockExpirationTime);

    const lockExpirationTimeIsFutureDateTime = now.isBefore(lockExpirationTime);
    should(lockExpirationTimeIsFutureDateTime).be.true();

    should(externalTask).have.property('flowNodeInstanceId');
    should(externalTask).have.property('correlationId');
    should(externalTask).have.property('processInstanceId');
    should(externalTask).have.property('payload');
    should(externalTask).have.property('createdAt');
  });

  it('should fail to fetch and lock, when the user is unauthorized', async () => {

    try {
      await testFixtureProvider
        .externalTaskApiClientService
        .fetchAndLockExternalTasks({}, workerId, topicName, 1, 0, 10000);

      should.fail(externalTaskIdToCleanupAfterTest, undefined, 'This request should have failed!');
    } catch (error) {
      const expectedErrorCode = 401;
      const expectedErrorMessage = /no auth token provided/i;
      should(error.code).be.match(expectedErrorCode);
      should(error.message).be.match(expectedErrorMessage);
    }
  });

  it('should fail to fetch and lock, when the user is forbidden to access ExternalTasks', async () => {

    try {
      await testFixtureProvider
        .externalTaskApiClientService
        .fetchAndLockExternalTasks(restrictedIdentity, workerId, topicName, 1, 0, 10000);

      should.fail(externalTaskIdToCleanupAfterTest, undefined, 'This request should have failed!');
    } catch (error) {
      const expectedErrorCode = 403;
      const expectedErrorMessage = /access denied/i;
      should(error.code).be.match(expectedErrorCode);
      should(error.message).be.match(expectedErrorMessage);
    }
  });

  async function createWaitingExternalTask() {

    const correlationId = uuid.v4();

    testFixtureProvider.executeProcess(processModelId, 'StartEvent_1', correlationId, {});

    await processInstanceHandler.waitForProcessInstanceToReachSuspendedTask(correlationId);
  }

});