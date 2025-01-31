JavaScript code for an AWS Lambda function which is receives Square webhook event notifications and saves them to an AWS SQS.<br>


Flow:<br>
API Gateway > Lambda function > SQS

* The AWS HTTP API Gateway is what is used for the Square webhook notification URL
  * The gateway simply passes the request to the Lambda function through integration
* Also using AWS Parameter Store to store the Square SIGNATURE_KEY and thus needed to use the extension "AWS Parameters and Secrets Lambda Extension"
* Due to using Square SDK which is not available directly in AWS, need to zip up Square SDK with the JavaScript code and upload it to the AWS Lambda function

This Lambda function has a few uses:
1. Receive the POST request (event) from the API gateway which was sent by Square
2. [Verify and Validate the Square Event Notification](https://developer.squareup.com/docs/webhooks/step3validate)
3. Get the Queue URL for an existing SQS and then send the request (event) body to the queue to be processed separately
4. Send a response to the API gateway and thus to Square

to use clone, modify lambdaSquareDeploy.js as needed, and then run the following commands:<br>
`npm run build` <br>
`npm run package`

then you can push the new ZIP to an existing Lambda function using AWS CLI like so:<br>
`aws --profile <YOUR_PROFILE> lambda update-function-code --function-name <YOUR_FUNCTION> --zip-file fileb://lambdaSquareDeploy.zip`
<br>or can manually upload the lambdaSquareDeploy.zip through the AWS console.
