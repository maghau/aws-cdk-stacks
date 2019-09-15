let AWS = require('aws-sdk');

exports.handler = async function(event, context) {
    const {
        email, // <-- UserId == email
        name,
        address,
        postalCode,
        city,
        countryCode,
        phoneNumber,
        locale,
    } = event;

    const userPoolId = process.env.cognitoUserPoolId;

    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const params = {
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
            {
                Name: 'name',
                Value: name,
            },
            {
                Name: 'phone_number',
                Value: phoneNumber,
            },
        ],
    };

    try {
        const result = await cognitoidentityserviceprovider
            .adminCreateUser(params)
            .promise();
        return {
            statusCode: 200,
            body: result,
        };
    } catch (error) {
        return error;
    }
};
