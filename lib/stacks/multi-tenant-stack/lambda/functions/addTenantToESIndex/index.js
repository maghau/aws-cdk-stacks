let AWS = require('aws-sdk');

exports.handler = async function(event, context) {
    const tableName = process.env.cognitoUserPoolId;
    const elasticsearchDomain = process.env.elasticsearchDomain;

    event.Records.forEach(record => {
        addTenantRecordToESIndex(record, tableName, elasticsearchDomain);
    });

    return 'WIP';
};

const addTenantRecordToESIndex = async (
    tenantRecord,
    tableName,
    elasticsearchDomain
) => {
    
};
