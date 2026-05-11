declare module 'react-native-version-check' {
    type LatestVersionOptions = {
        provider?: 'playStore' | 'appStore';
        packageName?: string;
        country?: string;
        ignoreErrors?: boolean;
    };
 
    type NeedUpdateOptions = {
        currentVersion?: string;
        latestVersion?: string;
        depth?: number;
    };
 
    type NeedUpdateResult = {
        isNeeded: boolean;
        currentVersion: string;
        latestVersion: string;
        storeUrl?: string;
    };
 
    const VersionCheck: {
        getCurrentVersion(): string;
        getCurrentBuildNumber(): string;
        getPackageName(): string;
        getLatestVersion(options?: LatestVersionOptions): Promise<string>;
        needUpdate(options?: NeedUpdateOptions): Promise<NeedUpdateResult>;
        getStoreUrl(options?: LatestVersionOptions): Promise<string>;
    };
 
    export default VersionCheck;
}