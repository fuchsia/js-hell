xwh
====
  
`xwh` is js-hell's experimental web "host". It allows scriptlets to be
run as CGI. 
  
And let me stress the _experimental_ part of its name. It's for experiemnts
and for experimenting with a different type of host. It's not a hardeneed web
server.
  

Use
---
```
js-hell xwh [-C DIR] [OPTIONS...] [[ADDRESS_STR] PORT_INT]
```
  
When run:
  1. xwh searches the directory tree for the project root. The starting point
     for the search can be set via `-C DIR`; e.g.
  
```bash
js-hell -C some/dir xwh   
```
  
  2. It then binds to the ADDRESS_STR (default `127.0.0.1`) and PORT_INT
     (default `8111`). 

     To make it a regular server bind it to address `0.0.0.0` and port `80`;
     e.g.  
  
```bash
js-hell -C some/dir xwh 0.0.0.0 80   
```
    You can pick these up from environment vairables (say ADDRESS and PORT):
```bash
js-hell -C some/dir 'js-hell xwh ${env.ADDRESS} ${env.PORT}'
```
    (But make sure those variables exist.)        
  
    i. By default, if stdin is a terminal, xwh will listen for keypresses and
       aborts it receives one. This can be stoppd with the
       `--no-abort-on-input` flag. 
                    
 
  3. Regular files are served as is. (TO DO: respect the `files` entry
     in package.json) 
  4. But where the first directory in the path matches a scriptlet name, a
     scriptlet will be used. 

     i. A scriptlet must be declared to output JSON or it won't run; e.g.
  
```json
    {
        "js-hell": {
           "./login.mjs": "API=1 login :: default(@option(Str) User) as JSON",
            "./post.mjs":  "API=1 post :: default()"
        } 
    }
```
        In the above, `login` _is_ a valid "cgi" script (and can be invoked as
        `http://localhost/login?user=name`) but `post` won't be run because
        it's  not predeclared to output JSON. (This is a security feature.)     
  
     ii. The GET/POST arguments will be used to fill out the scriplet's named
         arguments. (And any remaining path components will be supplied as
         positionals.) For example, the url
         `http://127.0.0.1/post/some/thread?user=fuchsia&message=hello%20world`
         Is equivalent to: 
  
```bash
js-hell 'post some thread --user=fuchsia --message="hello world"'
```
         POST only `accepts x-www-form-urlencoded` arguments and they will
         bemerged with any supplied in the URL.    
  
      iii. The result is returned. As noted, it must be JSON.
    
     
           

Eventually, we will move xwh into a separate package. But for the moment, it
requires deep integration into js-hell. One of the goals of the project is to
create an API so that a tool like xwh doesn't need deep integration into
js-hell.
  
### Options 
  
#### --no-abort-on-input
  
#### --no-package-json
What it says on the tin: assume the starting directory (as affeced by `-C`) is
the root and server plain files form there - no CGI; e.g.
```bash
js-hell 'xwh -C /some/dir --no-package-json'
```
NB, there is no magic autoindexing.

#### --rememote-stacktrace
Server generated errors (Generally "500" error codes) include a stack trace in
the content returned. Useful during development.    

#### --safe-call
Wrap the result of a scriptlet in a disciminated union that indicates success
or exeption.  
  
With this switch, the result from any JSONable CGI will be:
```json
{
   "success": <boolean>,
   "value": <any>
}              
```

If the scriptlet executed without throwing an exception, `success` is true and
`value` is its result. If the scriptlet threw an exception, `success` is
`false` and value is the error message (or the stacktrace, if
`--remove-stacktrace`). For example, you might code:
  
  
  
Scriptlets
----------
Currently scriptlets must return JSON.

The follow globals are available from within the binding:  
 
### `sessionId` 
The global `sessionId` is set to the client-supplied `uuid` cookie. If a
connecton doesn't have a `uuid` cookie, or it looks invalid, a uuid is created
via `crypto.randomUUID()` and will be set in the outgoing response.
  
For example:

```json
    {
        "js-hell": {
           "./login.mjs": "API=1 login :: default(@option(Str) secret, sessionId) as JSON",
           "./post.mjs": "API=1 post :: default(@option(Str) message, sessionId) as JSON",
        } 
    }
```
  
`xwh` rejects all user supplied `uuid` cookies that do not match the exact
format of version 4 UUID.             
  
Currently, js-hell always sets the sessionId to the NIL UUID
(`00000000-0000-0000-0000-000000000000`) So the commands above could be used
from the command line to login and post a message - presuming they persist the
information in a file or database. This can also be used to spot the
command-line since the NIL UUID would be rejected by a the server. (NO TEST) 
  

