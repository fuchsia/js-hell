// Help needs these, so we put it in a common file.
export const 
HOST_OPTIONS = `
[--log=FILE]   -- Save \`console.xxx()\` messages to FILE, instead of writing them to stderr.
[--stacktrace] -- Print a full stacktrace on error.
`;
export {HOST_OPTIONS as default};


// Ultimately this should end `SCRIPTLET ...ARGS` and be responsible for resolving the scriptlet.
export const 
PRE_SCRIPTLET_OPTIONS = `
[--stacktrace]
[--inspect]
[(--cwd|-C)=DIR]
[(--help|-h)] 
[(--version|-v)] 
`

export const 
SYNTACTIC_SUGAR = {
    '>': '--output',
    '<': '--input',
    '2>': '--log',
    // How do we handle 2>&1, which is fairly widespread.
};
 
