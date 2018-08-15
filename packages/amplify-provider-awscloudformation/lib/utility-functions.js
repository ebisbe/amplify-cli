const awsRegions = require('./aws-regions');
const Cognito = require('../src/aws-utils/aws-cognito');
const Lambda = require('../src/aws-utils/aws-lambda');
const DynamoDB = require('../src/aws-utils/aws-dynamodb');
const AppSync = require('../src/aws-utils/aws-appsync');
const { transformGraphQLSchema } = require('./transform-graphql-schema');


module.exports = {
  compileSchema: (context, options) => transformGraphQLSchema(context, options),
  getRegions: () => awsRegions.regions,
  /*eslint-disable*/
  staticRoles: context => ({
    unAuthRoleName: context.amplify.getProjectDetails().amplifyMeta.providers.awscloudformation.UnauthRoleName,
    authRoleName: context.amplify.getProjectDetails().amplifyMeta.providers.awscloudformation.AuthRoleName,
    unAuthRoleArn: context.amplify.getProjectDetails().amplifyMeta.providers.awscloudformation.UnauthRoleArn,
    authRoleArn: context.amplify.getProjectDetails().amplifyMeta.providers.awscloudformation.AuthRoleArn,
  }),
  /* eslint-enable */
  getUserPools: (context, options) => new Cognito(context)
    .then(cognitoModel => cognitoModel.cognito.listUserPools({ MaxResults: 60 }).promise()
      .then((result) => {
        let userPools = result.UserPools;
        if (options && options.region) {
          userPools = userPools.filter(userPool => userPool.Id.startsWith(options.region));
        }
        return userPools;
      }))
    .catch((err) => {
      context.print.error('Failed to fetch user pools');
      throw err;
    }),
  getLambdaFunctions: (context, options) => new Lambda(context)
    .then(lambdaModel => lambdaModel.lambda.listFunctions({
      MaxItems: 10000,
      Marker: null,
    }).promise()
      .then((result) => {
        let lambdafunctions = result.Functions;
        if (options && options.region) {
          lambdafunctions = lambdafunctions.filter(lambdafunction =>
            lambdafunction.FunctionArn.includes(options.region));
        }
        return lambdafunctions;
      }))
    .catch((err) => {
      context.print.error('Failed to fetch lambda functions');
      throw err;
    }),
  getDynamoDBTables: (context, options) => {
    let dynamodbModel;

    return new DynamoDB(context)
      .then((result) => {
        dynamodbModel = result;

        return dynamodbModel.dynamodb.listTables({ Limit: 100 }).promise();
      })
      .then((result) => {
        const dynamodbTables = result.TableNames;
        const describeTablePromises = [];

        for (let i = 0; i < dynamodbTables.length; i += 1) {
          describeTablePromises.push(dynamodbModel.dynamodb
            .describeTable({
              TableName: dynamodbTables[i],
            })
            .promise());
        }

        return Promise.all(describeTablePromises);
      })
      .then((allTables) => {
        const tablesToReturn = [];
        for (let i = 0; i < allTables.length; i += 1) {
          const arn = allTables[i].Table.TableArn;
          const arnSplit = arn.split(':');
          const region = arnSplit[3];
          if (region === options.region) {
            tablesToReturn.push({
              Name: allTables[i].Table.TableName,
              Arn: allTables[i].Table.TableArn,
              Region: region,
              KeySchema: allTables[i].Table.KeySchema,
              AttributeDefinitions: allTables[i].Table.AttributeDefinitions,
            });
          }
        }
        return tablesToReturn;
      })
      .catch((err) => {
        context.print.error('Failed to fetch DynamoDB tables');
        throw err;
      });
  },
  getAppSyncAPIs: context =>
    new AppSync(context)
      .then((result) => {
        const appSyncModel = result;
        context.print.debug(result);
        return appSyncModel.appSync.listGraphqlApis({ maxResults: 25 }).promise();
      })
      .then(result => result.graphqlApis),
  getIntrospectionSchema: (context, options) =>
    new AppSync(context)
      .then((result) => {
        const appSyncModel = result;
        return appSyncModel.appSync
          .getIntrospectionSchema({ apiId: options.apiId, format: 'JSON' })
          .promise();
      })
      .then(result => result.schema.toString() || null)
      .catch((e) => {
        context.print.debug(e);
      }),
};
