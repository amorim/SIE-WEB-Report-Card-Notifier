# SIE-WEB-Report-Card-Notifier
A Google Apps Script for automatically checking new information on report cards from SIE WEB

## Information
You can deploy this script very easily. You just need to create a firebase realtime database and do a post request to save your information.
Then just create a trigger for the `verifyEachUser` function and it'll check for changes regularly.

## Further improvement
The script is currently very badly written, with lots of duplicate code and unnecessary functions. I'll soon work on refactoring it prior to adding new features.
