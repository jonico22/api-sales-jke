
/**
 * Generates a download URL for a given file key or path.
 * Should be used to standardize download links across the application.
 */
export const getDownloadUrl = (pathOrKey: string, storageType: 'LOCAL' | 'S3' | 'R2' = 'R2'): string => {
    if (!pathOrKey) return '';
    if (pathOrKey.startsWith('http')) return pathOrKey;

    if (storageType === 'LOCAL') {
        const apiUrl = process.env.API_URL || 'http://localhost:5000';
        // Remove leading slash if present
        const cleanPath = pathOrKey.startsWith('/') ? pathOrKey.substring(1) : pathOrKey;
        return `${apiUrl}/uploads/${cleanPath}`;
    }

    if (storageType === 'R2' || storageType === 'S3') {
        const publicUrl = process.env.R2_PUBLIC_URL;
        if (publicUrl) {
            const cleanKey = pathOrKey.startsWith('/') ? pathOrKey.substring(1) : pathOrKey;
            // Remove trailing slash from publicUrl if present
            const cleanBase = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;
            return `${cleanBase}/${cleanKey}`;
        }
    }

    return pathOrKey;
};
