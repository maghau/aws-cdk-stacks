let AWS = require('aws-sdk');

exports.handler = async function(event, context) {
    const userPoolId = process.env.cognitoUserPoolId;
    const { username, groupName } = event;
    return addUserToCognitoGroup(userPoolId, username, groupName);
};

const addUserToCognitoGroup = async (userPoolId, username, groupName) => {
    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const params = {
        GroupName: groupName,
        UserPoolId: userPoolId,
        Username: username,
    };

    try {
        const result = await cognitoidentityserviceprovider
            .adminAddUserToGroup(params)
            .promise();
        return {
            statusCode: 200,
            body: result,
        };
    } catch (error) {
        throw new Error(error);
    }
};
