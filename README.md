# Launch Board

A small browser app you can open in VS Code, push to GitHub, and host with GitHub Pages.

## Open in VS Code

1. Open VS Code.
2. Choose **File > Open Folder**.
3. Open this folder:

   `/Users/phoebeflood/Documents/Codex/2026-05-19/i-want-to-build-an-app`

4. Open `index.html` in your browser to try the app.

## Put it on GitHub

1. Create a new repository on GitHub.
2. In VS Code, open the Source Control panel.
3. Commit the files.
4. Publish the branch to your new GitHub repository.

You can also do this from the terminal:

```sh
git init
git add .
git commit -m "Create Launch Board app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

## Host it on GitHub Pages

1. Open your repository on GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Set the branch to `main` and the folder to `/root`.
5. Save.

GitHub will publish your site at:

`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

## Customize it

- Change the app name in `index.html`.
- Change colors and layout in `styles.css`.
- Change task behavior in `app.js`.
