# JE Dunn Safety Checklist Backend Connector

This package contains the first backend connector file for the GitHub-hosted Safety Checklist Hub.

## Files

- `firebase-backend.js`  
  Connects the public HTML checklist hub to Firebase Firestore and Firebase Storage.

- `firebase-security-rules-draft.txt`  
  Draft Firestore and Storage rules for discussion before live use.

## Where this fits

Public worker page:

```text
index.html on GitHub Pages
```

Backend connector:

```text
firebase-backend.js in the same GitHub repo
```

Future admin dashboard:

```text
admin.html or /admin page connected to the same Firestore data
```

## Required HTML change

Add this line right before `</body>` in `index.html`:

```html
<script type="module" src="firebase-backend.js"></script>
```

## Required Firebase setup

1. Create a Firebase project.
2. Add a Web App inside Firebase.
3. Copy the Firebase configuration values.
4. Paste the Firebase configuration values into `firebase-backend.js`.
5. Enable Firestore Database.
6. Enable Firebase Storage.
7. Enable Firebase Authentication for the future private dashboard.
8. Review and apply final Firestore/Storage security rules.

## Data organization

The connector saves submissions to:

```text
Firestore collection: safetyChecklistSubmissions
```

Photos save under:

```text
safety-checklist-uploads/{COMPANY}/{CHECKLIST}/{SUBMISSION_ID}/
```

Each record stores:

- Submission ID
- Company name
- Company key
- Checklist title
- Checklist key
- Date
- Responses
- Corrective action
- Negative finding status
- Photo count
- Photo links
- PDF status placeholder

## Important

This connector does not create the admin dashboard yet. It prepares the data structure the dashboard will read from.
