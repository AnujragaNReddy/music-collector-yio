# Music Collector

## Saving scraped music to Google Drive (optional)

The Music Web Scraper's download step can save songs straight to Google
Drive instead of the backend's own (ephemeral, free-tier) disk. This needs
a one-time setup in Google Cloud Console — about 10 minutes — before it
shows up as an option in the app.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (or reuse one).
2. Enable the **Google Drive API** for that project
   (APIs & Services → Library → search "Google Drive API" → Enable).
3. Go to **APIs & Services → Credentials → Create Credentials → Service
   Account**. Give it any name (e.g. "music-collector"). You don't need to
   grant it any project-level roles.
4. Open the new service account → **Keys** tab → **Add Key → Create new
   key → JSON**. This downloads a `.json` file — keep it private, it's a
   credential.
5. In your own Google Drive, create (or pick) a folder for scraped music.
   Right-click it → **Share** → paste the service account's email address
   (it's the `client_email` field inside the JSON file, looks like
   `music-collector@your-project.iam.gserviceaccount.com`) → give it
   **Editor** access.
6. Open that folder in Drive and copy its **folder ID** from the URL —
   the part after `/folders/`:
   `https://drive.google.com/drive/folders/`**`THIS_PART_HERE`**
7. On the backend service in the Render dashboard, set two environment
   variables:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — paste the **entire contents** of the
     JSON key file from step 4.
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID` — the folder ID from step 6.
8. Redeploy the backend. The "Google Drive" option in the Music Scraper's
   "Save to" pills becomes clickable once `/api/health` reports
   `drive_enabled: true`.

Leaving both variables unset is fine — the app just keeps the Drive option
disabled and everything else works exactly as before.

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
