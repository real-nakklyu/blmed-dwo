# Firebase Setup

Use this app with Firebase Authentication + Firestore.

## 1. Create or open a Firebase project

Open the Firebase console and create a project for this DWO app.

## 2. Add a Web App

In Project Settings:

1. Click `Add app`
2. Choose `Web`
3. Register the app
4. Copy the Firebase web config object

This app expects these keys:

```json
{
  "apiKey": "",
  "authDomain": "",
  "projectId": "",
  "storageBucket": "",
  "messagingSenderId": "",
  "appId": ""
}
```

Paste that JSON into the `Cloud Setup` box on the home page, then click `Save Cloud Setup`.

## 3. Enable Email/Password Sign-In

In Firebase console:

1. Go to `Authentication`
2. Open `Sign-in method`
3. Enable `Email/Password`

## 4. Create Firestore Database

In Firebase console:

1. Go to `Firestore Database`
2. Create the database
3. Choose your preferred region

## 5. Apply Firestore Rules

Replace the Firestore rules with the contents of:

[`firebase-firestore.rules`](C:\Users\User\Desktop\BLMEDV2\firebase-firestore.rules)

These rules allow each signed-in user to read and write only:

- their own profile document at `users/{uid}`
- their own saved records at `users/{uid}/records/{recordId}`

## 6. Test the App

1. Open the home page
2. Paste the Firebase config JSON
3. Click `Save Cloud Setup`
4. Create an account with email + password
5. Sign in
6. Open a DWO form
7. Fill the required fields
8. Click `[ SAVE RECORD ]`
9. Open `Saved Records`
10. Search by patient name or DOB
11. Reopen the saved record

## Firestore Data Shape

The app writes:

- `users/{uid}`
  - `email`
  - `accountName`
  - `firstName`
  - `lastName`
  - `extension`
  - timestamps

- `users/{uid}/records/{recordId}`
  - `id`
  - `form`
  - `patientName`
  - `patientNameLower`
  - `patientDob`
  - `patientDobDigits`
  - `savedAt`
  - `savedAtMs`
  - `owner`
  - `ownerLabel`
  - `state`

## If Save or Load Fails

Check these first:

- Firebase config pasted correctly
- Email/Password provider enabled
- Firestore database created
- Firestore rules published
- The signed-in account matches the account you expect
