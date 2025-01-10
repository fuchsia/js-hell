import {resolveScriptlet} from "../resolve.mjs";
import {evaluate} from "../../Idl.mjs";

export const js_hell = `IDL=1
-- Import PACKAGE_NAME and use the js-hell syntax BINDING_TEXT to invoke a function. 
call PACKAGE_NAME BINDING_TEXT :: default($packageName,$bindingText)`;  
 
export default async function
run( runnable, binding )    
    {
        // 2024_3_20:  
        // - Can we not just create `Scriptlet.from( binding, url )`
        // and execute?
        // - Should this allow pacakgeNames or just files?
        //
        // 2024_11_12: This is probably horribly out of date and should
        // be banned. I'm not sure it'es even used.
        const {name:importName, args: importArgs } = evaluate( binding );
        // What we really want is resolvePackageName or something.
        // We are probably, now, the only shim users. All else is done in situ.
        const {main:module} = await resolveScriptlet( runnable, { shim: "IDL=1 cmd" } );
        if ( typeof module[importName] !== 'function' ) {
            throw new TypeError( "Module's binding is missing" );  
        }
        return await module[importName].apply( undefined, await importArgs );        
    }