export const js_hell = `IDL=1
-- List the exports in the ESM module MJS_FILE.
OUTPUT_FORMAT=Enum
get-exports MJS_FILE :: default($1.toURL())`;
export default async function ( url ) {
    const module = await import( url );
    return Object.keys( module );
}

