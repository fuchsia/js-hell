import {statSync} from "node:fs";

export default function 
safeStatSync( filename )
    {
        // Q: How safe do we want this to be? Can we get away `statSync( filename, { throwIfNoEntry: false } ) ?? null`? 
        // Is it a problem if other errors (access permission?) are treated as MISSING? Could we have undefined and null
        // to separate the two (`null` - missing. `Undefined` error? Or even return the error?)  
        try {
            return statSync( filename );
        } catch {
            return null;
        }
    }


