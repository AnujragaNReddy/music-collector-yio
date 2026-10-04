# Music Collector

## Saving scraped music to Google Drive (optional)

The Music Web Scraper's download step can save songs straight to Google
Drive instead of the backend's own (ephemeral, free-tier) disk. This uses
**OAuth delegation** — the app writes against *your own* Drive storage
quota, not a service account's (service accounts have none of their own,
and can't create files even in a folder shared with them). One-time setup,
about 10 minutes:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (or reuse one).
2. Enable the **Google Drive API** for that project
   (APIs & Services → Library → search "Google Drive API" → Enable).
3. Go to **APIs & Services → OAuth consent screen**, fill in the minimum
   (app name, your email), and click **Publish App**. (Only `drive.file`
   scope is used here, which isn't Google-restricted, so this publish step
   needs no manual review from Google — it's just a button click.)
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**, type **Desktop app**. Copy the **Client ID** and **Client
   Secret** it gives you.
5. On your own machine, with `python-backend/requirements.txt` installed
   (`pip install -r requirements.txt`), set those two values and run the
   one-time authorization script:
   ```
   # macOS/Linux
   export GOOGLE_OAUTH_CLIENT_ID=...
   export GOOGLE_OAUTH_CLIENT_SECRET=...

   # Windows PowerShell
   $env:GOOGLE_OAUTH_CLIENT_ID="..."
   $env:GOOGLE_OAUTH_CLIENT_SECRET="..."

   python get_drive_token.py
   ```
   A browser window opens — sign in and approve access. The script then
   creates a fresh **"Music Collector"** folder in your Drive (the app
   needs to have created the folder itself to see it under the `drive.file`
   scope) and prints four values.
6. Copy those four printed values into the backend service's environment
   variables in the Render dashboard: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`,
   `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
7. Redeploy the backend. The "Google Drive" option in the Music Scraper's
   "Save to" pills becomes clickable once `/api/health` reports
   `drive_enabled: true`.

Leaving these unset is fine — the app just keeps the Drive option disabled
and everything else works exactly as before. The new Drive folder can be
renamed or moved afterward from within Drive without breaking access,
since it's tracked by id, not by name/location.

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
