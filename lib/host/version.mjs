import {default as _package} from "../../package.json" with { type: "json" };

// 2024_9_27: Called as `$0` because it is called both `ver` and `version`
export const js_hell = `IDL=1 

-- Output the version of js-hell, or the version of SCRIPTLET if supplied.  

$0 [SCRIPTLET] :: default($1 = null )`;

export default function( scriptlet ) {
    if ( scriptlet ) {
        return typeof scriptlet.version === 'undefined' ? '(undefined)' : scriptlet.version;
    }
    return _package.version;
}