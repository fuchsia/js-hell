import PackageTree,{NODETYPE_SCRIPT,SOURCE_BUILTIN} from "./PackageTree.mjs";
import {formatRowsInColumns} from "../formatOutput.mjs";

const DAGGER = '\u2020'
/// @brief Move this mostly (entirely?) into help. 
async function
getCommands()
{
    const packageTree = new PackageTree;
    await packageTree.addCwdPackageTree();
    
    const builtin = [],
          user = [],
          packageScripts = [ ];
     
    for ( const node of packageTree.packages() ) {
        
        const {name,type,source} = node;
        if ( source === SOURCE_BUILTIN ) {
            builtin.push( name );
        } else if ( type === NODETYPE_SCRIPT ) {
            packageScripts.push( name ); 
        } else {
            const runnable = await node.isRunnable();
            if ( runnable ) {
                user.push( name + ( runnable?'':DAGGER ));
            }
        }
    }
    builtin.sort( ( a, b ) => a.localeCompare( b ) );
    user.sort( ( a, b ) => a.localeCompare( b ) );
    packageScripts.sort( ( a, b ) => a.localeCompare( b ) );
    return {builtin,user,packageScripts}; 
}

// FIXME: we should return Line[] and leave the code to handle the result.
export default async function
helpIndex( screenColumns = 80 )
    {
        // let usage, summary, details, platformOptions, defaults;
        // FIXME: we want a scriptlet, or spoof scritplet, that will return all this.
        // So we can just use the below path.
        const {user,builtin,packageScripts} = await getCommands();
        // FIXME: we want an IDL that looks like this. Should the arg here be SCRIPTLET.
        const usage = "js-hell SCRIPTLET ...";
        const summary = "";
        const details = [
            // FIXME: the help wrapper should spot and handle tab lists. 
            ...formatRowsInColumns( builtin, screenColumns,                                         "builtins: " ),
            ...user.length ? [ '' , ... formatRowsInColumns( user, screenColumns,                   "package:  " ) ] : [],  
            ...packageScripts.length ? [ '', ...formatRowsInColumns( packageScripts, screenColumns, "npm run:  " ) ] : []  
        ];
        const defaults = [];
        return { usage,summary,details,defaults};  
    }
