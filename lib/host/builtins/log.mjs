// FIXME: we want to be able to write this as `[--[level=](debug|log|info|error|warn)]` i.e. they are exclusive
// swithces with an optional level, assigned to level - even if missing.
//
//
// This is for a) test cases and b) running groups of commands in a subshell where we want them logged together
// and c) because we are trying to provide CLI access to all nodes internals.     
export const js_hell=`IDL=1    
    -- Write a messge to the log. (i.e. call \`console[LEVEL](TEXT)\`)    
    log [--level=(debug|log|info|error|warn)] TEXT     
    :: default( level = "log", $1 )   `;  
    
export default function( level, text ) {    
    console[level]( text );
}