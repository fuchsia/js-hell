export const 
EXIT_SUCCESS = 0,                 //< The scriptlet executed successfully and returned something other than false.
EXIT_FAILURE = 1,                 //< The scriptlet executed successfully and returned false. 

EXIT_ARGV_ERROR          = 2,     //< Error in the the argv supplied to main() (Currently unsued.)  
EXIT_IDL_ERROR           = 3,     //< Invalid IDL (or couldn't resolve a file?) Possibly CLI errors in nested scripts? (Currently unused) 
EXIT_SCRIPTLET_EXCEPTION = 4,     //< Dynamic exception thrown from scriptlet? 
// Errors that should be prefixed `js-hell:` 
EXIT_JS_HELL_EXCEPTION = 5;  //< Internal Error?



