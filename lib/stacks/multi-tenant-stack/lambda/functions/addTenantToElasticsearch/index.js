const uuidv4 = require('uuid/v4');
const ddb = require('aws-sdk/clients/dynamodb');

// This lambda triggers on new item added to the tenant-table via DynamoDB streams

exports.handler = async function(event, context) {
    
    const tableName = process.env.tableName;
    const elasticsearchDomain = process.env.elasticsearchDomain;

    const result = await addTenantToElasticSearch(event, tableName);
    return result;
};

const addTenantToElasticSearch = async (event, tableName) => {//TODO: Implement};
