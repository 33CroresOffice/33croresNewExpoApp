const fs = require('fs');
const path = require('path');

const DEFAULT_CLIENT_ID = '33crores';

function getActiveClientId() {
  if (process.env.CLIENT_ID) return process.env.CLIENT_ID;
  const pointerPath = path.join(__dirname, '.active-client.json');
  if (fs.existsSync(pointerPath)) {
    try {
      const { clientId } = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
      if (clientId) return clientId;
    } catch (e) {
      // fall through to default
    }
  }
  return DEFAULT_CLIENT_ID;
}

function loadClient(clientId) {
  const clientDir = path.join(__dirname, 'clients', clientId);
  const configPath = path.join(clientDir, 'client.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Unknown client "${clientId}" (expected ${configPath} to exist). ` +
        `Run "npm run apply-client -- <clientId>" with a valid client id from the clients/ folder.`
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return { clientDir, config };
}

function assetPath(clientDir, filename) {
  if (!filename) return undefined;
  const absolute = path.join(clientDir, 'assets', filename);
  if (!fs.existsSync(absolute)) return undefined;
  return './' + path.relative(__dirname, absolute).split(path.sep).join('/');
}

module.exports = () => {
  const clientId = getActiveClientId();
  const { clientDir, config } = loadClient(clientId);
  const assets = config.assets || {};
  const icon = assetPath(clientDir, assets.icon);
  const primaryColor = config.primaryColor || '#FFFFFF';
  const backgroundColor = config.splashBackgroundColor || '#FFFFFF';

  return {
    expo: {
      name: config.name,
      slug: config.slug,
      version: config.version,
      orientation: 'portrait',
      icon,
      scheme: config.scheme,
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,
      splash: {
        image: assetPath(clientDir, assets.splash || assets.icon),
        resizeMode: 'contain',
        backgroundColor,
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: config.ios && config.ios.bundleIdentifier,
        googleServicesFile: assetPath(clientDir, assets.googleServiceInfoPlist),
      },
      android: {
        package: config.android && config.android.package,
        versionCode: config.android && config.android.versionCode,
        adaptiveIcon: {
          foregroundImage: assetPath(clientDir, assets.adaptiveIcon || assets.icon),
          backgroundColor,
        },
        permissions: ['INTERNET', 'POST_NOTIFICATIONS'],
        googleServicesFile: assetPath(clientDir, assets.googleServicesFile),
      },
      web: {
        bundler: 'metro',
        output: 'single',
        favicon: assetPath(clientDir, assets.favicon || assets.icon),
      },
      plugins: [
        'expo-router',
        'expo-font',
        'expo-web-browser',
        [
          'expo-notifications',
          {
            icon,
            color: primaryColor,
          },
        ],
      ],
      experiments: {
        typedRoutes: true,
      },
      extra: {
        router: {},
        eas: config.easProjectId ? { projectId: config.easProjectId } : undefined,
        clientId,
        client: {
          initialRoute: config.initialRoute,
          primaryColor,
        },
      },
      owner: config.owner,
    },
  };
};
