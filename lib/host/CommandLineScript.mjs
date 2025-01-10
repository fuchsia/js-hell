import Scriptlet from "./Scriptlet.mjs";
import {getCurrentShellJob} from "./shellJobs.mjs";
import {EXIT_SUCCESS} from "./exit_codes.mjs";

let lastJobId = 0;
/// @brief This is the wrapper used for scripts in the packagetree: 
/// it presents the script as a module.
///
/// Todo: it needs to be capapble of returning the final result
/// so it can participate in pipelining.
/// 
/// Todo: it would be nice if we could override options for simple scripts.
///
///
export default class 
CommandLineScript {
    #scriptText;
    #startupDir;
    ['default'];
    constructor( scriptText, {startupDir }={}) {
        this.#scriptText = scriptText;
        this.#startupDir = startupDir;
        // We are pretending to be a module. 
        // So 
        //    1. `default` has to be an ownProperty
        //    2. It won't get called as `this.default()` so has to be a closure. 
        this.default = () => this.exec();
    }
    
    async exec() {
        
        // FIXME: these are "subjob" ids: only the user initiatiated tasks should get a jobid.
        const jobid = ++lastJobId;
        // Q: we can't use '%' as a jobid. Is '!' everybit as bad? `&1` or `|1`
        // or `job:1`
        console.log( "[!%d] %s>%s", jobid, this.#startupDir, this.#scriptText );
        // FIXME: 
        // - We need to be able to return the output of the function. (Capture.)
        //   We also need to capture the type info. 
        // - The console doesn't need to be overwritten again. 
        // - stdio...
        //
        // All of this means we need a context object in the global namespace. `hostContext`
        const {shell} = getCurrentShellJob(); 
        const errorlevel = await shell.execJob( [ "node", "js-hell", this.#scriptText ], { startupDir: this.#startupDir } )
        // Q. should we prefix all the console output (and command-line output?) with the jobspec?
        // A: ShellJob's should have a prefix which we can amend.
        // Q. should we use nested ids; e.g. `[!2 !4]` to indicate !4 is a child of `!2`?
        // (`job:2.4`)
        console.log( "[!%d] exited (%d)", jobid, errorlevel );
        // Deciding what to pass back our is problematic.
        //  
        // If we are a single command it would make sense to pass it back, as is. Ditto if we are a pipehead.
        // But in both cases our type is hidden.
        //
        // Other cases get more complicated; e.g. if we had modifiers on output, if we are an iterator,
        // or are a compound statement. (Could we return an array in the latter case?)
        //
        // So, for the moment, we return booleans. But that is not the intended long term behaviour; at the 
        // very least we should return the text that would have been output if we were directly connected to
        // a tty. 
        return errorlevel === EXIT_SUCCESS;
    }

    toScriptlet( scriptName ) {
        return Scriptlet.from( 
            `IDL=1 -- Execute the script:\n--\n-- >${ JSON.stringify(this.#scriptText).slice( 1, -1 ) }\n${scriptName} :: default()`,
            // If script begins '//' we are in trouble. (But we could add spaces.)
            `script:${this.#scriptText}`,
            this, 
            scriptName 
        );
    }
};




