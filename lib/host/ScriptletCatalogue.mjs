import Scriptlet from "./Scriptlet.mjs";
import json_q from "../utils/json_q.mjs";
import {getCurrentShellJob} from "./shellJobs.mjs";

const MAGIC_KEY = Symbol;

/// @brief A scriptlet catalogue is the first stab at a multi syntax scriptlet:
/// it bundles up a package so it's commands are accessible as `cmd name ...`
///
/// It has module syntax.
export default class 
ScriptletCatalogue /* extends Module */ {
    #name;           //< string: 
    #sublets;        //< <<string> name,<Scriptlet>>[]
    #source;         //< URL: Used for PackageTreeNode.

    // \begin{
    // These three (along with `toScriptlet`) might allow us to be in the packageTree
    get name() { return this.#name }
    get type() { return 'catalogue' }
    isRunnable() { return true }
    get source() { return this.#source }          // This is vital for getOwnScriptletEntries()
    get value() { return this.toScriptlet() }     // Ditoo.
    
    // }
     
    //
    async exec( subletName, tail ) {
        const entry = this.#sublets.find( ([name]) => name === subletName );
        if ( !entry )
            throw new Error( json_q`No such sub command ${subletName}` );
        const sublet = entry[1];
        const module = await sublet.importModule();
        const idl = sublet.idl; 
        const r = [ {type:'$n',value:idl.name,info:''}, ...tail];
        // This enables us to create a lexical environemnt that matches the one
        // we were invoked with. I haven't thought about stdio issues here. It's
        // better than nothing (what we were doing) and gets us running.
        //
        // Q: would it be better like:
        //   return `getCurrentShellJob().exec( idl, module, r )`;
        // Ideally, would this even set the result; i.e. it functions like
        // classic `execve(2)` (although, remember, we are pretending to
        // be a function in a module).
        const options = getCurrentShellJob().lexicalEnvironmentOptions;
        return sublet.idl._execParsed( module, r, options );
    }
    
    constructor( magic, name, sublets, source ) {
        if  ( magic !== MAGIC_KEY )
            throw new Error( "Illegal invocation" );
        this.#name = name;
        this.#sublets = sublets;
        this.#source = source;
    }

    toScriptlet() {
        // 2024_12_12: FIXME: we can't handle help, --help, etc... and we ought to be able to.
        // Is this a reason for using combined syntax?
        const cmds = this.#sublets.map(([name]) => name).join( '|'),
              idlText = `IDL=1 $0 (${cmds}) :: default( $1, $2 )`,
              scriptlet = new Scriptlet( idlText, {
                name:this.#name,
                // 2024_12_11: FIXME: we should be able to write the IDL to remove the need for this closure;
                // e.g. `with(* as thisModule) thisModule.exec()`; we're not the only case. `with()` can
                // then end up with the same syntactic production as `import...` 
                module:{
                    default: ($1,$2) => this.exec( $1, $2 )
                }    
            });
        // A: Should we import all the modules now? Or defer?
        // Or hack `scriptlet.importModule()` so that it does that?
        scriptlet.idl.addTail(); // 
        return scriptlet;
    }
    
    static 
    fromPackageTree( packageTree, { url, name } ) {
        const sublets = packageTree.getOwnScriptletEntries( url );
        if ( sublets.length === 0 )
            throw new Error( "Package has no scriptlets" );
        // 2024_12_30: It is convenient if we can handle this.
        // 2025_1_7: Except, one test case has this: where it insists the cmd pacakge be honoured.
        // I haven't thought about it more.
        if ( false && sublets.length === 1 )
            throw new Error( "Package has a single scritplet - it should be the implied root" );    
        return new ScriptletCatalogue( MAGIC_KEY, name, sublets, url );  
    }
    static 
    async fromScriptlets( sublets, { name, source } ) {
        if ( sublets.length === 0 )
            throw new Error( "Package has no scriptlets" );
        return new ScriptletCatalogue( MAGIC_KEY, name, sublets.map( scriptlet => [ scriptlet.name, scriptlet ] ), source );
    }

};
