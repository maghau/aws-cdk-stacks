const ddb = require('aws-sdk/clients/dynamodb');

exports.handler = async function(event, context) {
    const result = await addUserToTenantAcl(event, 'Tenant');
    return result;
};

const addUserToTenantAcl = async (event, tableName) => {
    const documentClient = new ddb.DocumentClient();
    const {
        userSub,
        group,
        accessLevel,
    } = event;

    const params = {
        TableName: tableName,
        Item: {
            TenantId: tenantId,
            DataType: 'ACL',
            
        },
    };

    const result = await documentClient
        .put(params, (err, data) => {
            if (err) {
                console.error(err);
                throw new Error(err.message);
            }
            return data;
        })
        .promise();

    return {
        tenantId,
    };
};
