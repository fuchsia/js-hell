import {AsyncLocalStorage} from 'node:async_hooks';

// Exported so main() can run it. But really don't want to.
export const currentShell = new AsyncLocalStorage;

export function
getCurrentShellJob( ) {
    return currentShell.getStore(); 
}

export function
runShellJob( shellJob, callback ) {
    return currentShell.run( shellJob, callback );
}
 
 