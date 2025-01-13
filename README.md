JS-HELL 
=====
Js-Hell is a tool for running javascript from the command-line (CLI). 

Instead of using a library to write a bespoke CLI script, you annotate
your script or package and js-hell runs it for you. (In essence, your
script becomes a plugin for js-hell.)
  
To learn how to write these annotations, skip straight to the
[IDL](#IDL) section.

Examples 
----
### Custom script
If you're hacking up a custom script, it's often easiest to annotate the
file itself:
```js 
export js_hell = "IDL=1 vectorise [--force] JSON_FILE NAME :: default( await $1.json(), $2, {force}) as JSON -> $1"; 

export default function main( json, id, {force} )
   /* modify json */
    ...
   /* return to get it saved out */ 
   return json;
}
```

The data needed is in the exported `js_hell` key (note an underscore,
not a hyphen).

Invoke this as 
```bash
$ js-hell vertorise.mjs --force somefile.json id
```
or
```bash
$ js-hell vertorise.mjs somefile.json id
```
  
### Package
Or you can describe it in the `js-hell` key of your package. (Note a
hyphen here.)
  
#### package.json: 
```json 
{
  "name": "my-script",
  "main": "main.mjs",
  "js-hell": [
      "IDL=1",
      "my-script                -- Process PNG_FILEs to produce our data.", 
      "    [--iterations=COUNT] -- Number of times to process data.",
      "    PNG_FILE... ",
      ":: crunchData( $1.map( file => file.toBuffer()) ,{iterations=1})"
  ]
}
```
#### main.mjs: 
```js
import Processor from "./Processor.mjs"; 

export function crunchData( buffers, {iterations}) {
    const processor = new Procesor;
    for (const b of buffers)    
        processor.add( b, iterations );  
   return processor.stats();
}
```   
And invoked as 
```bash
js-hell my-script --iterations=3 **/*.png 
```

Alpha Status & Mercurial Repo
----
js-hell has been in existence privately for several years. (And it has
the technical debt to prove it.) A recent round of tidying to get it fit
for public release has only highlighted the many limitations and
frustrations that remain. (Including the documentation.)  

However js-hell's too bloody useful to keep locked up. (And even more
useful if when you use `xwh` and can run CGI from the command line using
a CLI interface.) Hopefully the shortcomings will be rectified over
time. But despite the 1.x tag it is really still alpha. 

Also the principle repo is mercurial. I intended to switch fully to git,
as I become familiar with the gitisms - assuming I can master them and
my innate desire to swim against the tide doesn't make me stick to hg.

Requirements
------- 
It was my aim that js-hell shouldn't support any version of node.js
before the most recent LTS release. That didn't survive contact with the
real world (long, hard stare at glitch) and it probably runs on node
16.14, although there may still be bugs.

Installation 
----
It's expected js-hell will be installed globally:

```
npm install -g js-hell
```

It's js-hell's job to manage compatibility issues. (The `IDL=` tag that
all IDL declarations begin with solve the internal compatibility. You
can similary invoke scripts with `CLI=` tag.)

js-hell install a single binary: `js-hell.mjs` which is a rolled up
an minified (`dist/js-hell.mjs`) which can be moved about anywhere and 
used, as is.

### Optional Dependencies
js-hell has an _optional_ dependency on better-sqlite3. The intent is to
retire this for node's internal implementation when it becomes stable.
(But some of my tools depends on better-sqlite's features.) It's only
required if you call the `database()` method on `File` and otherwise
won't be used.  

Project axiom
------
A0: It is a strong project goal that any javascript module invokable by
js-hell should be invokable without js-hell. There should be no strong
dependencies. 

Current exceptions:
  - We have a custom implementation of fetch [fetch]() that handles
    files.
  - the browser globals `alert()`, `confirm()` and `prompt()` are
    supplied for the console. (Implement them please node.) 
  - `console.status()` `console.statusClear()` and
    `console.statusFlush()` allow updating of a console "status" line.
    (Implement them, everyone!)
      
API
---
It's a project goal that js-hell will become embeddable in other
projects. But no public API is yet offered. It's strictly command-line.
The xwh server is a step towards that.

CLI 
---
js-hell is invoked as `js-hell SCRIPTLET [OPTIONS]...` where OPTIONS 
depend on the SCRIPTLET. 

SCRIPTLET can be a javascript source file, a JSON file, a directory
containing `package.json`; it can be a module somewhere in the package
tree; or it can be one of the builtins. `js-hell help` list builtins and
modules found in the package tree. See [Package resolution]() for more
details.


### Coventions 
Throughout this documents, arguments are written as

```bash
js-hell '"cmd --argument *.html *.css"'
```

This utilises [doubled quoting](#doubled-quoting) and [single first argument
reparsing](#single-first-argument-reparsing) to run on Windows and Unix without 
interference from their respective shells. 

Obviously, it's up to you what you write in the privacy of your own
terminal. But remember on POSIX shells (i.e. bash, zsh etc...) you
will have to protect the arguments from evaluation; e.g. 
```sh
js-hell dir * 
```
will call `dir` with all the files whereas 
```sh
js-hell dir '*'
```
will let dir lookup the files (and start listing them as soon as one is
found, instead of waiting for the whole directory to be read).

And similarly, POSIX shells will want to interpret many of the features
js-hell provides; e.g.
```sh
js-hell scriptlet --option=${value}
``` 
is very different to
```sh
js-hell scriptlet '"--option=${value}"'
```

### Tokenisation

#### Doubled quoting
Single and double quotes are trimmed from any argument js-hell is
passed (i.e. any argument in argv). For example, typing `js-hell echo "'some'"`
or `echo '"some"'`
results in js-hell outputing `some` (without any quotes).

The exact rule is that quotes are removed when one of the quote
characters (`"`or `'`) opens an argument, and the same quote character
closes it and occurs nowhere else in the argument. {[REDUP-*]
first-pass}

This allows safe cross-platform quoting; e.g.
```json
{
    "scripts": {
        "start": "js-hell '\"xwh ${env.PORT}\"'"
    }
}
```
means `npm start` will work on Windows and unix. (Windows only
understands double-quotes so js-hell is passed `'xwh ${env.PORT}'` as
its argument. Whereas, unix shells will respect the outermost single
quotes and pass js-hell `"xwh ${env.PORT}"` as its argument. In either
case, the extra set of quotes is trimmed.)

The same rule applies to the arguments of options (i.e. the bit after an
equals sign) For example, `echo-value --value='"some thing"' prints
`some thing` (and not `"some thing"`) to the console.

This is a feature of thr argv parser.

#### Single first argument reparsing
If js-hell has a single positional argument then it reparses it using
it's own tokensier; e.g. 
```bash
js-hell '"scriptlet --option=${value} *.html"'
```
is the same as
```bash
js-hell scriptlet --option='${value}' '*.html'
```

This flexibility, however, can be a gotcha if you are trying to invoke a
scriptlet with a space in the filename _and no other arguments_.  
currently no work around. 


#### Tokenisation of argv
When js-hell is run from another shell (bash, zsh, cmd.exe, etc...), that
shell breaks the command-line into a series of arguments. These are
passed to js-hell in an array known as `argv`. Unhelpfully, all the
quotes have been removed which leaves js-hell in the dark about what was
quoted. So js-hell applies the following logic:

 1. Elements of argv that contain exactly two ocurrences of the single-
    (`'`) or double- (`"`) quote---one at the beginning and one at the
    end---have them stripped. Such arguments are considered quoted, and
    can never be "syntax" - i.e. cannot be options, operators, etc...
    {[REDUP-*] first pass} 

    NB. To access this feature from another shell means
    reduplicating quotes, e.g. `js-hell echo '"--output=file"'`

 2. Elements of argv that begin with `${` are expected to be
    expressions. They'll be passed using the parser for bindings. And they are
    expected to finish with the closing `}` as the last character of the
    argument. Anything else should be an error. (Tests?)
 
 3. Elements of argv that begin with a backtick (`` ` ``) are passsed as
    template literals. They are expected to run through to the end of
    the argument and terminate with another backtick. It's an error if
    they terminate before the end of the argument, or don't terminate at
    all. (Tests?)

 4. Elements of argv that exactly match an operator (e.g. `>`, `|`,
    `&&`, etc...) are treated as an operator. (You need reduplicated
    quoting to prevent this; e.g. `js-hell echo some '"&&"' echo thing`
    prints `some && echo thing` to the console; whereas `js-hell echo
    some "&&" echo thing` prints two lines `some` and `thing`) 
  
 5. The first element of argv that is a double-dash (`--`) is deleted.
    All remaining elements of argv that beging with a dash will be
    treated as positionals. For example, in `js-hell cmd --x -- --y`
    `--x` is an option, but `--y` isn't. (Tests?) And `js-hell echo --
    --y` prints `--y` rather than complaining about a missing option.

    (This is not the only way to do it. Things that look like options
    can be quoted and will be treated as strings. But, because of the
    shell you have to reduplicate the quotes - e.g. `js-hell echo
    '"-Cdir"'` is a safe way to print `-Cdir` to the console. But so is
    `js-hell echo -- -Cdir`.)

 6. Elements of argv that are a single dash (`-`) are the file topic.
    This wil be stdin, if a FILE, or a literal '-' if the argument
    is not "file-like". The section on the FILE TOPIC gives the ins and
    outs. <!-- Q: How many of those rules are tokeniser rules and so
    should be here? -->
 
 7. Elements of argv that _start_ with a _single_ dash (`-x`) are passed
    as short options.     

 8. Elements of argv that _start_ with a double dash (`--some`) are
    treated as long options. If they don't contain an equal sign (`=`)
    the option name is the entire string. If they do contains an equals
    sign (`--some=value`) they are split at the first equal. The option
    name is everything up to the equals (`--some`) and the remainder
    after the equals is reparsed according rules 1-3 above to create the
    option's value.

    (The equals sign is entirely optional. An option expecting a value
    will consume the next positional. But it makes for more obvious parsing.)

#### Tokenisation of strings
When breaking a string into "arguments", js-hell uses the follow rules:

<!-- This mirrors the desc in builtins.json for argtok. We need to keep
them in sync? Or move it here?--> <!-- Split this into topics -->

 1. Arguments are separated by "spaces" (any codepoint matching `/\s/`)
    and by the specials ``!?$%^=@#~()[]{}<>&|,;`'"``. (So `some>file` is
    two argments separator by the `>` operator.)  
 2. Spaces and specials must be quoted for their literal value to appear
    in an argument. {[ARGTOK-SPECIAL-*]} Due to code reuse, the
    double-colon `::` cannot appear unquoted. (A bug to be fixed...)
 3. Simple Quoting:
     <!-- Annoying we can't nest with letters; it displays as roman numerals. -->
    1. Quoting happens with single (`'`) or double (`"`)
       quotes.
    2. Quoting runs through to the next occurence of the
       character.
    3. Quoting must cover the entire argument. (So there is
       no quoting spaces in the middle of the string like `some" "thing"`.)
       The exception is the argument to an option counts 
       so `--some="thing"` fine, as is `--empty=""`
    4. There are **no escapes** with backslashes or anything else.
       (This is for compatibility with Windows where, for example,
       `"\\server\share\some dir\"` makes it about impossible to escape
       anything with a backslash.) {[ARGTOK-BACKSLASH-*]}
    5. Quotes must be proceed by or followed by a space or an operator;
       it is an error for them to happen mid argument. (So `cmd x" "y`
       is an error.)
 5. Backticks also quote. (e.g ``cmd `hello world` ``) 

    These are **not** command subsitution, as is normal for a shell, but
    are strings evaluated according to the rules for javascript's
    [template literals.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
    That means:

    - Templates supports backslash escapes (so 
    ``js-hell '"echo1 `\x22`"'``
    will output a `"`) and backslashes will need to be escaped 
    (so ``js-hell '"echo1 `c:\\\\dir`"'`` outputs `c:\\dir`
                             
    - The Expressions in a template literals evaluated as "bindings",
    not
    as straight javascript. For example
    ``js-hell '"echo1 `The answer is ${prompt()}`"'`` will prompt for 
    a command line string and then echo it.

    - The execution context is `undefined`. 

    - They should always return strings.

    - `$(` is reserved {[TEMPLATE-NO-$(]} and must be escaped. At some
      point it will support CLI subshells, e.g. 
     ``js-hell echo1 `some$(cmd)thing`" ``

 6. `${}` can be used to say the argument should be the result of an
    expression; e.g. `js-hell '"cat ${prompt()}"'` It cannot be quoted
    and must take up the whole argument, i.e. a space must follow the
    closing `}` Strings will probably be instantiated, but non-strings
    will be left as is.
           

#### Version token
When invoking the global js-hell from a script, start the command line
with `CLI=1`; for example: 

```bash 
#!/bin/sh 

js-hell '"CLI=1 scriptlet --option=value"'
```

This tells js-hell which version you are using and it might even adapt.


### Recursion and wildcards
   
#### `**` wildcard available.
The `**` wildcard is available to recursie into subdirectories; for example
```bash
     js-hell '"dir **/*.txt"'
```
lists all `.txt` files in the current directory tree - subject to
exclusions (see below).
  
(It also lists all directories. You can turn this off with `--no-dirs`.)

##### TO DO: Switch to node's globs.
This was built before node gained glob support. It will eventually move
over to node's globs and equivalent functions.
    
#### Recursive handling of directories.
If a scriptlet wants a glob, and a directory is given, then `**` will be
appended to it. (For example, `js-hell dir some_dir` is the same as  
`js-hell '"dir some_dir/**"'`)
  
BUT, if a scriptlet specifies a type of file (for example, it specifes
JSON files) then the glob will have the relevant extension(s) (so
`json-thingy dir` becomes `js-hell json-thingy dir/**/*.json`).
  
The extension are those listed for the mimetype, and multiple extensions
can be implied. (For example, `html-thingy srcwww` would become `js-hell
html-thingy srcwww/**/*.htm srcwww/**/*.htm`)
  
The `--no-recurse` option prevents this behaviour; and a non-recursive
glob is used. (So `js-hell json_thingy --no-recurse dir` is `js-hell
json_thingy dir/*.json`)
  
#### --recurse
The option `--recurse` or `-R` inserts `**` before the final element of
all globs. (For example `js-hell '"make_ico -R dir\*.png"'` is the same
as `js-hell '"make_ico dir\**\*.png'"`)
  
<aside class="issue"> `` is a legacy feature that predates `**`.
Is it still useful? Should it be pulled?</aside>                  

#### Exclusion      
All filenames returned by globs are vetted against an exclusion-list
that filters out matching file.  The default exclusion list is `.*` - so
files beginning with a '.' are not reported. 

This can be controlled by the `--exclude` flag. Setting it overrides all
the defaults. (Which means the `**/.*` is lost. So for example `js-hell
dir --exclude=p* .` will return `.git` file. You need to do `js_hell dir
--exclude=p* --exclude=.* .` to preserve the `.*` exclusion.)
  
To view all files, set the exclude list to the empty pattern. (For
example `js-hell dir --exclude="" .` shows everything.)
    
<aside class=issue>Should `--exclude` be handled with a NOT flag in the
glob? How often do people really use these complicated globs?</aside>


### Pipelines and redirection

#### >FILE 
The `>` output redirection is available as normal. It's syntactic sugar
for `--output=FILE` e.g.
```bash
js-hell '"echo boo >goose"'
```
is the same as 
```bash
js-hell '"echo boo --output=goose"'
```
There is (currently) no rewriting of `process.stdout`
{[REDIR-OUT-ARGTOK],[REDIR-OUT-ARGTOK]}

#### 2>FILE 
Stderr redirection is available via the `2>` operator.
{[REDIR-LOG-ARGTOK],[REDIR-LOG-ARGTOK]} It's syntactic sugar for
`--log=FILE` e.g.
```bash
js-hell '"log-echo message 2>status.log"'
```
is the same as 
```bash
js-hell '"log-echo message --log=status.log"'
```
given a _hypothentical_ `log-echo` command. Agian, there is (currently)
no rewriting of `process.stderr`; it just captures the `console.xxx`
messages.

#### <FILE
The '<' input redirection is available. And syntactic sugar for
`--input=FILE` e.g.
```bash
js-hell '"select "* from table" <database.sq3"'
```
is the same as 
```bash
js-hell '"select "* from table" --input=database.sq3"'
```

#### '-' (The File Topic)
As is traditional, `-` can be used as a file name meaning stdin; e.g.
```bash
js-hell '"echo fish | cat -"'
```
which asks `cat` to output stdin, and so will print `fish`.
{[PIPE-FILETOPIC-POSITIONAL]}

`-` can also be used as arguments to an option:
```bash
js-hell '"echo `{"option":"value"}` | cmd --config=-"'
```
which means cmd's config file will be the passed json - assuming cmd's
IDL includes `--config=JSON_FILE` or something similar.
{[PIPE-FILETOPIC-OPTION]}

A `-` that occur after "--" is treated as an ordinary dash. For example
```bash
js-hell 'cat -- -'
``` 
the above tries to output a file called "-". {[STRTOK-FILETOPIC],
[ARRAYTOK-FILETOPIC]} But it's probably easier just to supply a path -
e.g:
```bash
js-hell 'cat ./-'
```

A dash will be treated as plain text when not used to an argument that's
"file-like"; for example:
```bash
js-hell 'echo -'
```
which outputs an ordinary "-". {[FILETOPIC-TEXT-*]} 

"-" cannot be used twice - as it's a stream; for example this is an
error:
```bash
js-hell 'echo "boo!" | cmd - -'
```


<!-- This doesn't belong here -->

And you can't use `--output` while piping: {[PIPE-TEELESS]}
```bash
js-hell 'echo "boo!" --output=file.txt | cmd'  
```




### Shell Variables / Substitution
There is hastily bolted on support for shell variables via `${}`; for
example, in the below, the second argument to cmd are the conents of the
variable "thing".
```sh
js-hell '"cmd ${thing}"'
```                  

***Remember*** when calling from a conventional posix shell, you need to
protect against the shell inserting its own variable.

Variables must be complete arguments; e.g. this will NOT work:
```sh
js-hell '"fetch https://${host}/${file}"'
```                  
The variables won't even be spotted (use backticks). NB,
however, this does work:
```sh
js-hell '"cmd --arg=${value}"'
```                  
because what comes after the '=' is special. 

What goes in the brackets is an expression in the same
javascript-derived language that is used for the IDL's binding. So you
can do thinfs like: 
```sh
js-hell '"cmd --arg=${prompt()}"'
```

#### Soft coercion
If the value returned is a string, it will be converted into the type as
if you'd typed it on the command line; for example access:
```sh
js-hell '"xwh ${env.PORT}"'
```
this works fine, even though env.PORT is a string. Ditto:
```sh
js-hell '"xwh ${prompt(`Enter_port:`)}"'
```

#### Caveats
The following limitations:
 - Variables can't appear in lists. For example, annoyingly, this
   doesn't (yet) work: `js-hell 'echo ${var}'` 
 
   
### List of global switches

#### Before the module name.
These option can appear anywhere:   
       
  * `--stacktrace` When emitting errors, print a full stack trace.
  * `--inspect` Wait to launch the script until a debugger has attached.
  * `--cwd=<DIR>` and `-C<DIR>` Set the current directory. When it
    occurs before the command, it will affect scriptlet resolution; e.g.
    `js-hell -C/some/dir cmd` will look for `cmd` in `/some/dir/`. When
    it occurs after, it will not; so `js-hell cmd -C/some/dir` will find
    `cmd` in the current directory and then changes to `/some/dir/` for
    argument resolution and running the script.
       

#### Options
          

### Scriptlet Resolution 
js-hell can run any javascript function - provided it has information on
how to call it from the Command Line Interface (CLI). Functions with
such annotations are called "scriptlets", and "scriptlet resolution" is
the process of locating the javascript function and its annotation.

#### Outline Algorithm
The process to resolve a SCRIPTLET_NAME into the (module,
annotation)-pair works as follows:
    
1. If a `SCRIPTLET_NAME` begins `http:`, `https:` or `file:` then it's
   assumed to be a [module url](#modules). ((No tests))

2. If a `SCRIPTLET_NAME` begins `/`, `\`, `./`, `.\` or `[A-Z]:` then
   its assumed to be a [file url](#files). ((No tests))
  
3. If neither of these conditions are met, then a [package tree is
   created](#the-package-tree) for the current directory. Roughly,
   js-hell steps up the directory tree to find a `package.json` and adds
   likely candidates along with some builtins. `js-hell help` will list
   the scriplets in the package tree.
             
4. If the `SCRIPTLET_NAME` matches a package name in the package tree,                  
   then that will be used.
  
5. If there's no matching package in the package tree, and the
   `SCRIPTLET_NAME` doesn't begin with '@', but does contain a full stop
   (`.`), a forward slash (`/`) or backslash (`\`) - then it's assumed
   to be a file.

6. Anything else is an error.


##### builtin: resolve
The `resolve` builtin provides access to js-hell's resolver. Given a
scriptlet name it returns the url of the module that will be used. (For
example `js-hell resolve my-command` will point to the ESM module that
will be imported to run `my-command`.) 

Adding `--idl` option to `resolve` will show the exact annotation - "the
IDL". (For example `js-hell resolve --idl my-commend`.) Alternatively,
the `help` builtin will show a user friendly version of the idl. (For
example `js-hell help my-command` or `js-hell my-command --help`.)
    
         
#### Files

When presente dwith a file, js-hell first looks at the extension. If a
it's `.mjs` or `.js` then js-hell will treat it as an ESM module. (For
example, `js-hell my-file.mjs`) See [Modules](#Modules) for how they are
handled.
   
If a file has a `.json` extension, then a package tree will be built
from it and the root package used. (For example, `js-hell ./app.json`
would parse `app.json` as if it was a `package.json` and likely invoke
the main module.)  

If a file is a directory and it contains a `package.json` file, then
js-hell will use that file and invoke the root. (For example, `js-hell
c:\src\project` would use `c:\src\project\package.json`)  

Anything else should be an error.
  
#### Modules
When presented with a module, js-hell will `import()` it and look at the
`js_hell` export. 
  
If that's a string, then that is expected to be the Interface Definition
Language ([IDL]()) description of how to run the file.  
        
For example, suppose `my-cmd.mjs` looks like this:

```js 
export function main() {
    return "Hello world!"; 
}

export const js_hell = "IDL=1 my-cmd :: main()"; 
```
Then `js-hell ./my-cmd.mjs` would echo `"Hello world!"`;

The js-hell key can also be an array of strings - which will be joined
with '\n'. Anything else is an error.
   

#### The Package Tree
Given a package.json, js-hell will build a package tree as follows:
  
1. First it will add all the builtins to the tree. These can't be
   overriden.
  
2. Then it looks at the `"js-hell"` key of the package.json.
  
      1. If the `"js-hell"` key is a string (or an array of strings),
      then a scritplet is added with the same name as the
      package. (The value of the js-hell key is the IDL for the
      main entry point---arrays are joined with line-breaks---and the
      IDL declared name must match the package name.)
    
      2. If it's a non-null object, then it's treated as [scriptlet
      list.](#scriptlet-list)

      3. Otherwise, no root package will be available.

3. If the package.json doesn't provide a js-hell scriptlet list (2ii), then
   the `"dependencies"` and `"devDependencies"` will be evaluated, and
   any explicit js-hell packages provide by them will be added to the
   tree. (I.e. to block this auto adding, you must supply an object to
   the js-hell key; you will then have to manually declare the main
   package.)
            
4. Finally, any entries in the "scripts" key that begin `js-hell` will
   be added. (FIXME: all package scripts of the top level package should
   be available.)

#### Scriptlet List
```json 
{ 
  "name": "my-package",
  "main": "main.mjs",
  "js-hell": {
      "-- Keys beginning '--' are ignored":
         [ "(Yes, Crockford, when formal comments aren't available",
           "everybody invents their own incompatible syntax;"
           "better to have one agreed upon standard.)" ],

      "-- The package below will be called `my-package` and uses main.mjs": "",
      "my-package": [ "IDL=1", "-- My package!!", "my-package :: default()" ],

      "-- The package below will be called `package2`, and use the main of":"", 
      "-- the `package2` dependecy.": "",
      "package2":   "IDL=1 package2 :: default()",

      "-- The package names for this entry will be whatever pacakge3 provides": 
         "it may be `package3` or it could be `wibble` and `wobble`.", 
      "package3":   "*",
      
      "-- The package below will be called `script`, come what may.": "",
      "./script.mjs": "*",

      "-- The package below will be called `first-entry`": "",
      "./script2.mjs#first-entry": "IDL=1 first-entry :: first()",

      "-- The package below will be called `second-entry`": "",
      "./script2.mjs#second-entry": "IDL=1 $0 :: second()"

      "-- The package below is called 'max' and needs no module": "",
      "#max": "IDL=1 max INT... :: with() Math.max(...$1)"
  },
  "dependencies": {
     "package1": "1.0",
     "package2": "1.1" 
  },
  "devDependencies": {
    "package3": "2.0"
  } 
} 
```
In the above, the scriptlet list is value of the `"js-hell"`
entry - i.e.:
```json
{
    "my-package": [ "IDL=1", "-- My package!!", "my-package :: default()" ],
    "package2":   "IDL=1 package2 :: default()",
    "package3":   "*",
    "./script.mjs": "*",
    "./script1.mjs#first-entry": "IDL=1 first-entry :: first()",   
    "./script2.mjs#second-entry": "IDL=1 $0 :: second()",
    "#max": "IDL=1 max INT... :: with() Math.max(...$1)"   
}
``` 

Entries where the key begins `"--"` are ignored. Other keys can be:
  - the name of a package declared in the outer package.json. This must
    either match the `"name"` field of the outer package.json, itself,
    or be listed in its `"dependencies"` and `"devDependencies"` fields.  
      
  - the url of an ESM module. Currently all urls must begin `./` or
    `node:` Relative urls should be restricted to the subtree of the
    package (but this is not yet enforced).

  - a fragment (i.e. something beginning '#'). The url used will be that
    of an empty module. This is mainly used to declare js-hell's builtin
    comamnds.
 
The values for each entry are either the explicit IDL to use or `"*"` to
indicate the IDL (and possibly commands) will be "imported" from the
module or package. (`"package3"` and `"./script.mjs"` in the above.)


##### Scriptlet Names (External Names)
The name of a scriptlet is deduced from the key in the scriptlet list.

When the key is an URL, and there's no "#"-fragment, then the path's
basename is used, stripped of any extension. (For example,
`./script.mjs` will create a scriptlet called `script`.)

If the URL has a fragment, then the fragment (stripped of the '#') will
be used as the scriptlet name. (For example, `./script1.mjs#first-entry`
will create a scriptlet called `first-entry`, and
`./script1.mjs#second-entry` will create a scriptlet called
`second-entry`.)

When a scritplet's name is a dependency name (i.e. another package),
then the scriptlet name will be the dependency's name. 

When the IDL for a dependency is '*' _and the dependency provides
multiple scriptlets,_ then they will be created as _sub-commands_ of the
scriptlet:

For example, if `"package3"` has this as it's package.json:
```json
{   
   "name":"package3",
   "main": "./main.mjs",
   "js-hell": {
       "./main.mjs#wibble": "IDL=1 wibble :: wibble()", 
       "./main.mjs#wobble": "IDL=1 wobble :: wobble()"
   } 
} 
```
Then the command `wibble` and `wobble` will be accessible as `package3
wibble` and `package3 wobble` <sup>(PKT-MULTI)</sup> 


##### IDL Names (Internal Names)
The IDL also gives a name for the scriptlet. This must match the
"external" scriptlet name. 

For example, if a script is called `"./script.mjs"` then the IDL _can't_
be `"IDL=1 cmd :: default()"` {[NAM-ESM]} it has to be something like
`"IDL=1 script :: default()"`. Likewise this package is misnamed:
{[NAM-PKG]}

```json
{
    "name": "cmd",
    "main": "./main.mjs",
    "js-hell": "IDL=1 command :: default()"
}
```

Again, the `"js-hell"` key has to be something like `"IDL=1 cmd ::
default()"`. 

However the IDL can use `"$0"` as the scriptlet name, and that will
always take on the external name; {[NAM-$0]} for example, the scriplet
in this package is called `cmd-thing`.
```json
{
    "name": "cmd-thing",
    "main": "./main.mjs",
    "js-hell": "IDL=1 $0 :: default()"
}
```


### Exit codes
js-hell exits with the following codes:

|code| meaning
|---|------
| 0 | The command line was successful.
| 1 | The command line was successfuly, but return false.
| 4 | The scriptlet itself threw an exception - i.e. user code. {[EXIT-USER-EX]}
| 5 | Some other error.

### builtins
Js-hell provides a number of builtin scriptlets. As follows:

#### template
```
template (JSON|FILE) TEMPLATE_FILE
```
The template builtin evaluates the contents of `TEMPLATE_FILE` as if it
were a string quoted with ` `` ` - i.e. a javascript template literal.
`(JSON|FILE)` is a dicionary that provides the variables used for
substitution. 

For example, given a file `vars.json`:
```json
{
    "ghost": "Boo!"
}
```
And a template file, `template.txt`:
```txt
I said to the ghost, "${ghost}" 
```
Then the output of `js-hell '"template vars.json template.txt"'` will be
`I said to the ghost, "Boo!"` {[BUILTIN-TEMPLATE-FILE]} 
 
If the json has come from another scriptlet, then it can be piped to
template with the file topic; e.g. `json-outputting-cmd | template -
template.shtml` {[BUILTIN-TEMPLATE-FILETOPIC]}
  

IDL 
---
An IDL string looks like this:
```
IDL=<version> <usage> :: <binding>
```
 - `<version>` has to be `1`. 
 - `<usage>` describes the command line options and parameters and
   defaults.  
 - And the `<binding>` describes how to invoke the javascript. 

  
### Overview of Usage 
A typical usage string might be:
```
cmd [--show-line-numbers] [--max=COUNT] [--pattern=(regex|glob)] TEXT [SOURCE_FILE...] RESULT_FILE
```

It's roughly as you'd expect:
 - The scriptlet name must match the ["external"
   name.](#scriptlet-names-external-names) or be the special "$0".
   Because of this it's allowed to be mixed case. {[NAM-MIX]}
 - Long options must be lower case - separated by hyphens ("kebab
   case"). They must come before any positionals. Options without values
   ([booleans](#boolean-options)) can have an "--no-<option>" to turn it
   off. 
 - UPPERCASE text indicates values the user must supply, and must match
   a type - [see below](#recognised-types). In some cases,
   ["unions"](#type-unions) are supported, e.g. `(HTML_FILE|TEXT_FILE)`.
 - Square brackets indicate optional values. Positionals can be nested,
   as long, as its unambiguous. 
 - An elipsis indicates a positional is repeated (e.g. `FILE...`).
   {[RE-POS,RE-OUT,RE-IN]} Options can also be repeated, but it must be
   optional and the elipsis must be outside the square brackets (e.g.
   `[--option=TEXT]...`) {[MULT-OUT,MULT-IN]} Repeatd booleans (e.g.
   `[--verbose]...`) become a count of the number of times applied.    
 - Lower case text (that's not an option) is literal text. Brackets and
   vertical bars can be used to create alternatives (i.e. in the above
   example the `--pattern` option, if present, must take the value
   "regex" or "glob").
 - Short options aren't show above, but they can created as
   `(-c|--long-value)`.  
 - Help text can be placed after the scriptlet name and options
   with a "-- " comment:
```
    cmd          -- This does some important stuff. 
      [--option] -- Turn the optional thing on.
```
   You can also place a description of the comamnd after `"IDL=1"`
   instead of after the scriptlet name. Positionals currently can't
   receive help text.  
 - It's possible to set bash-style "environment vars" before the
   scriptlet name, for example `OUTPUT_FORMAT=Table calc-report
   SOURCE_FILE`. These supplied default text values. Can be useful for
   platform options and where configuring an option is hard.

### Overview of Binding
A typical binding string might be:
```
someFunction( $text, $2, { maxCount = 4, showLineNumbers, pattern = "text" }) -> $3
```
This is a function call - but with defaulting (like a normal function
_declaration_) and some historic magic.


 - There are two forms of binding: a function-form and an expression
   form. In both cases, the exports of the module are in scope. (With
   any default export available as `default`.)

    1. For the function-form, the binding **must begin with a call to
       a function.** (Historic quirk: it's possible to omit the
       name and `default` was assumed. Don't do that.) But there can't
       be anything after the function call. And it must be the only
       export that is used.
    2. The expression-form begins `with()`, and the `with` must include
       all the identifiers from the module that will be used. A normal
       expression can then follow (e.g. `with(default,TYPE_ONE) default(
       $1 = TYPE_ONE )` or `with(Archive) new Archive($1).method($2)`)
       This is really new, and probably full of bugs. 
     
 - The values of any command-line options are in scope as camel-case
   names. Optional values must have a value supplied via defaulting or
   `??`.
 - The positonals are available as the customary `$1`, `$2`, etc...
   numbered as per the order they occur _in the binding._
 - If a type name only occurs once as a positional, then it is available
   as camel cased name with a leading `$`. (So, in this case, `$1` and
   `$text` are the same variable, as are `$sourceFile` and `$2` and
   `$resultFile` and `$3`. {[BIND-IPOS,BIND-SUB]}
 - stdin/stdout is combined in a magical FILE-like object called `$-`.
 - The `=` operator is not used for assigment but for "defaulting" (as
   per function declaration); i.e. it assigns only if the value doesn't
   already have a value. 
 - When the output of a command is to be stored in a file supplied on
   the command line, use arrow-assigment (`-> $3`). But if the output is
   going to stdout, you don't need this.  
 - All operators are missing - the only ones supported are `??` and `?:`
   (as well as `.` and `[]`). Some maths is available via `Math.sum()`,
   `Math.product()`, `Math.bits()`, `Math.reciprocal()`, `Math.neg()`,
   `Math.div()`, and `Math.quotient()`. (But why are you doing complex
   arithmetic in glue code?) And `Math.equal()` will say if two numbers
   are equal.
 - `??`is actually a catch operator.
 - The [proposed pipeline operator
   `|>`](https://github.com/tc39/proposal-pipeline-operator) is
   available. Also, topics can be numbered, with '%1' being the output
   of the original function: 
   ``` 
   IDL=1 
   cmd ARCHIVE_FILE FILE... 
   :: with (Archive)
        new Archive()
        |> $2.forEach( file => %.add( file ) )
        |> %1.toUint8Array() -> $archiveFile'
   ```    
 - It's an async context with `await` available.
 - The unary '*' operator is equivalent to `[Symbol.iterator]` and
   iterators have a map on their prototype. (So `*files.map( f =>
   [f.name,f.size])` returns an iterator that iterates the names and
   sizes of files.) 


### Boolean options
Options that don't take a value are called booleans options. 
```js
export const js_hell=`IDL=1 boolie [--flag] :: default(flag);
export default function(flag) { return flag ? "enabled" : "disabled" }
```
<!-- Boolean options are always optional; i.e. they must appear in square
brackets. (For example, `IDL=1 cmd --flag` throws an error.) -->

A boolean's lexical variable defaults to false (e.g. `flag` in the above
is false and `js-hell boolie` returns `"disabled"`) {[BOOL-UNSET]} and
becomes true, when the option is present in the command-line invocation
(e.g., `js-hell boolie --flag` returns `"enabled"`.) {[BOOL-SET]}

However booleans options that begin `--no-` have the "no"-prefix removed
from their lexical name _and_ the usual semantics are reveresed. So for
example:
```js
export const js_hell=`IDL=1 nolly [--no-can-do] :: default(canDo);
export default function(canDo) { return canDo ? "done" : "You're kidding me, right?!" }
```   
in the above, `js-hell nolly` retuns `"done"` {[NO-UNSET]} and `js-hell
--no-can-do` returns `"You're kidding me, right?!"` {[NO-SET]}. 

#### Tristate
It's possible to declare both a boolean option and it's negation in the
usage; for example:

```js 
export const js_hell=`IDL=1 tristate [--no-state] [--state] 
:: default((state?1:-1) ?? 0)`;
```
In these cases, either the option (e.g., `js-hell tristate --state`
{[TRISTATE-TRUE]}) or it's negation (e.g. `js-hell tristate --no-state`
{[TRISTATE-FALSE]}) can be supplied on the CLI. (But not both. {})

If the option is not supplied, then it will be "missing" and a default
must be set. {[TRISTATE-ABSENT]} (Unfortunately, the lack of a default
in the binding can only be picked up at run time.) (FYI Missing values
parse through the ternary operator and are caught by `??` - which is why
`(state?1:-1)??0` works.)

Booleans options can only occur once in the usage. (For example, `IDL=1
cmd [--flag] [--flag]` throws.) {[NODUP-BOOL]}

#### Recurring
"Boolean" options may be repeated: 
```js
export const js_hell = `IDL=1 loggable [(--verbose|-v)]... :: default({verbose})`; 
```
Their lexical value becomes the number of time they're repeated on the
command-line - defaulting to zero if absent. (For example, `loggable` is
called with `{verbose:0}`, `loggable --verbose -v` is called with
`{verbose:2}` and `loggable -vvv` is called with `{verbose:3}`.)
{[MULTIBOOL-*]}

### STRING, STR and TEXT positionals and options.
Positional parameters can be declared as `STRING`, `STR`, or `TEXT`:
```js
export const js_hell=`IDL=1 cmd STR STRING TEXT :: default($1,$2,$3);
export default function(...strings) { return strings }
```
Each is passed to the javascript as [<string>][] value.

Likewise, options can be given `STRING`, `STR`, or `TEXT` values:
```js
export const js_hell=`IDL=1 cmd --scheme=STR --host=STRING --path=TEXT :: default(scheme,host,path);`
export default function(scheme,host,path) { return `${scheme}://${host}/${path}` }
```
When options are genuinely optional (i.e. enclosed in square brackets)
using omitted values is an error; so a default must be supplied: 

```js
export const js_hell=`IDL=1 
     cmd [--scheme=STR] [--host=STRING] [--path=TEXT] 
  :: default(scheme = 'https:', host = '127.0.0.1', path = '' )`;
```
 
#### Methods
Inside js-hell all strings have the following extra methods ("flying
monkeys"):

##### `hash([seed])`
 - `seed` [<number>][] The seed to use. Defaults to a
   (non-cryptographic) random  number. 
 - Returns: [<number>][] 

Calculate a fast, non-cryptographic hash of the string. (It's currently
the murmur3 32bit hash of the string's utf8 encoding.)
```json
{
    "js-hell": [
        "IDL=1",
        "shuffle --seed=NUMBER STRING...", 
        ":: with( )",
        "    $1.toSorted( ( a, b ) => Math.diff( a.hash( seed ), b.hash( seed ) ) )",
    ]   
}
```
   
### FILE, FILE_NAME and FILENAME positionals and named options    
Positional and named options can declared can be declared as `FILE`,
`FILE_NAME` and `FILENAME`. 

`FILE` values are passed to the javascript as
[`Buffer`](https://nodejs.org/api/buffer.html) objects (where available)
or
[`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) 
(platforms without buffer) - see `File.toBuffer()` {[FILE-REAL]}  
FILE_NAME and FILENAME options are passed to the javascript as strings.
{[FN-REAL]}

However, inside js-hell (i.e. in the binding) they all have the same
API, roughly modelled on the File API
[File](https://developer.mozilla.org/en-US/docs/Web/API/File) and set
out below: 

#### Properties

##### `name` 
A string containing the basename of the file. (For example, a scriptlet
declares as `IDL=1 cmd FILE :: with() $1.name` called as `cmd
some/path/to/file.txt` will return `file.txt`) {[FILE-NAME]}

##### `webkitRelativePath`
A string containing the name the user supplied on the command line. (For
example, a scriptlet declared as `IDL=1 cmd --option=FILENAME :: with()
option.webkitRelativePath` and called as `cmd some/path/to/file.txt`
will return `some/path/to/file.txt`) {[FILE-RELPATH]}

##### `fullPath`
A string containing the absolute path (For example, a scriptlet declared
as `IDL=1 cmd FILE_NAME :: with() $1.fullpath` and called as `cmd
some/file.txt` might return return `c:\\dir\\some\\file.txt`)
{[FILE-FULLPATH]} (This property comes from
[FileSystemEntry](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry).)

##### `isFile`
A boolean that is true if the file exists and is an ordinary file.
{[FILE-IS]} (This property comes from
[FileSystemEntry](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry/isFile).) 

##### `isDirectory`
A boolean that is always false {[FILE-NOTDIR]} (This property comes from
[FileSystemEntry](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry/isDirectory).)

##### `size`
The size in bytes of the file, if it exists. {[FILE-SIZE]} Or `NaN` if
it doesn't. {[FILE-SIZE-MISSING}]

##### `lastModified`
The number of milliseconds (probably excluding leap seconds) since 1st
January 1970, if the file exists. {[FILE-DATE]} Or `NaN` if it doesn't.
{[FILE-DATE-MISSING}]

##### `type`
A string containg the mimetype of the file. {[FILE-TYPE]} This is
currently deduced from the filename alone, so will be defined even if
the file exists. {[FILE-TYPE-MISSING]} And if the file name has no
extension {[FILE-TYPE-NOEXT]} or the extension can refer to multiple
file types (e.g. `.ico`), or the extension is not known, then the empty
string is returned.

Most of this is consistent with what browsers do; see
[MDN.](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type)

#### Methods
(NB, the `<type>()` methods return promises---thanks `File`---and the
`to<Type>()` methods return synchronous results.)    

##### `toArrayBuffer()`
Return the content of the file a [<ArrayBuffer>][]
{[FILE-TO-ARRAYBUFFER]}

On node 22, this invariably involves creating a copy of the buffer.
(Because the buffers return by `readFileSync()` are partial views of the
underlying ArrayBuffer and so the whole ArrayBuffer has to be copied.)
Using `toBuffer()` avoids that.

##### `arrayBuffer()`
Asynchronous version of `toArrayBuffer()`; i.e. return the contents of
`toArrayBuffer()` wrapped in a proimise. {[FILE-ARRAYBUFFER]}
   
##### `toBuffer()`
Return the content of the file as a [<Buffer>][] (node.js) or an
[<Uint8Array>]() (other platforms.) (For example, a scriptlet declared
as `IDL=1 cmd FILE :: with() $1.toBuffer()` and called as `cmd
some/file.txt` would return the contents of `some/file.txt` as a Buffer)
{[FILE-TO-BUFFER]}

If you try and pass a `File` instance from js-hell to a javascript
function, then this method will be automaticall used. (For example,
`IDL=1 cmd FILE :: with() $1` returns the same as `IDL=1 cmd FILE ::
with() $1.toBuffer()`) This is a process known as type realisation. This
is partly historic (`File` wasn't in node when js-hell was created) and
also because the object used by js-hell isn't a `File`. But
9-times-out-of-10, it's what's wanted and a real `File` is a
asynchronous hell hole. {[FILE-REAL]}  
 
##### `buffer()` 
Return the contents of `file.toBuffer()` wrapped in a promise.
{[FILE-BUFFER]} For symmetry.

##### `database([TABLE_NAME])`
This returns an sqlite3 database. The following files are supported: 

 - `.sq3` Opened as an sqlie3 table for read/write.
 - `.csv` Converted into a `:memory:` database using `TABLE_NAME` as the
    name of the table (default "data"). No write. 
 - `.json` This _must_ be an array of objects. It will be converted into
    a `:memory:` database with a table called `TABLE_NAME` and there
    will be a column for each field in the object; exactly as if you
    called `console.table()` on it. No write.        
            
Currently, this uses better-sqlite3 and relies on that being available.
But the plan is to transition to node's sqlite implementation once that
becomes stable. 

##### `toJSON()`
A convenience method that parses the contents of the file with
`JSON.parse()`. {[FILE-TO-JSON]} 

##### `json()`
A promise containing the contents of the file parsed via `JSON.parse()`.
{[FILE-JSON]}

##### `toLines()`
Return an _iterator_ that iterates over the lines in the file, returning
the text content of each line. The line seperator can be `\n` or `\r\n`
or EOF. It's **not** included the text returned. {[FILE-TO-LINES]}

##### `lines()`
Return an _async iterator_ that iterates over the lines in the file.
Apaert from async, it's the same as [`toLines()`]() {[FILE-TO-LINES]}   
   
##### `toText()`
Return the content of the file as utf8 encoded string. (For example, a
scriptlet declared as `IDL=1 cmd FILE :: with() $1.toText()` and called
as `cmd some/file.txt` would return the contents of `some/file.txt`)
{[FILE-TO-TEXT]}

##### `text()`
For compatibility with `File`, this method return the contents of
`file.toText()` wrapped in a promise. {[FILE-TEXT]} 

##### `toURL()`
Return the full path to the file as a `file:` url {[FILE-URL}, even if
the file doesn't exist. {[FILE-URL-MISSING]}

### (JSON|FILE)
Positional and named options can declared can be declared as
`(JSON|FILE)` This can be either literal JSON, or a file which is parsed
as JSON.

#### On command line:
When invoked from the command line, js-hell will parse the argument as
JSON, _iff_ it begins `{` or `[`. Otherwise it's treated as a filename.

For example, ``js-hell '"template `{}` file.txt"'`` Passes template an
empty dictionary (i.e the javascript object `{}`) and not the contents
of a file called `{}` (and, yes, that is a valid filename). On the other
hand, `js-hell '"template true file.txt"'` will pass template the
contents of a file called `true` and not the literal value `true`. 

Passing literal JSON is virtually impossible thanks to the quoting
minefield. But if you really must:
 - From a POSIX shell: ``js-hell 'template `{"key":"value string"}`
   template-file.txt'`` is probably easiest. {[LITERAL-JSON-DQ]} 
 - From windows cmd.exe, ``js-hell "template `{""key"":""value  
   string""}` template-file.txt"`` should work. (No test) 
 - And if you want it to be cross-platform, it's ``js-hell '"template
   `{\x22key\x22:\x22value string\x22}` template-file.txt"'``
   {[LITERAL-JSON-HEX]} 
 - You can cut down on quotes by using expressions;  e.g. ``js-hell
   '"template ${ ( {key:`value string`,count:2} ) }
   template-file.txt"'``. Note the need for an extra set of parenthesis
   inside `${}` and the use template literals rather than quoted
   strings. That's cross platform. (And the spaces inside `${}` are for
   exposition and can be omitted.) {[LITERAL-JSON-EXPR]}

#### From Javascript:
The contents of a `(JSON|FILE)` argument are passed to javascript as the
JSON object.   

Small print: Actually, inside IDL, the object is either the literal JSON
_or_ a FILE (as described above) with all the file methods. If it's a
file (including the file topic) it's altered so it undergoes [type
realisation]() via the `toJSON()` method. Meanwhile, literal JSON
probably ought to be wrapped in `JSON.parse(JSON.stringify(value))` to
confirm it's valid JSON, but that doesn't happen (for now) so just about
anything can be passed through...    
  
   
### Other Recognised Types
These exist by remain undocumented:
   
  | Type | JS |  Desc  
  | ---- | -- | --------
  | INT, INTEGER  | number bigint  | An integer - can end up as either an `Number` or `BigInt` 
  | COUNT         | number     | An unsigned integer - can end up as either an `Number` or `BigInt`.
  | NAME              | string | A string, but with different semantic connetations.
  | URL               | WhatWG/node URL |
  | JSON              | object |
  | DATE              | Date  |
  | DIR               | ?     | Partly FileSystemDirectoryEntry, partly File.
  | DIRNAME,  DIR_NAME  | string  | But with likely special rules
  | SCRIPTLET         | ?     | This will be resolved to a scriptlet; `resolve` is `IDL=1 resolve [--idl] SCRIPTLET :: with() $1[idl?'idl':'moduleUrl'].toString()`
      

#### Subtypes 
You may prefix a type name by an arbitary (uppercase) string followed by
an underscore. E.g. `COUNT` could be `BYTE_COUNT` or `RECORD_COUNT`.
(These are called "subtypes".)

Subtypes may have special meanings. For files, it's the extension; e.g. 
`PNG_FILE` means a `*.png` file is expected.

##### Index Types
Positional arguments may append a number as a suffix to the type e.g.
`cmd FILE1 FILE2`. (But _not_ `cmd --file=FILE1`.)

#### Type Unions 
Its possible to combine types with brackets and vertical bars, e.g.
`(TXT_FILE|HTML_FILE)` to indicate the value must be one of the listed
types. 

It's always possible to combine subtypes, as a union e.g.
`(PNG_FILE|JPEG_FILE)`. Most others are currently not possible. But
`(FILE|URL)` is specially handled (as is the even more exotic
`(FILE|DIR)`.) You will need to figure out ways to handle this in the
binding.  
 

### Type realisation 
Type realisation is a behind-the-scenes cast which js-hell inserts to 
turn its internal types into the publically declared one.

For example in this code: 
```json
{
  "name": "cmd",
  "js-hell": "IDL=1 cmd GLOB :: callback($glob)" 
} 
``` 
Callback is called with a string. But globs aren't stored internally as
strings - they are instances of a class called `GlobPattern` and un 
unwritten `$glob.toString()` call is injected. That is "type
realisation".

The most obvious example of this is integers. Integers are stored in a
class called PotentiallyUnsafeInteger but in this code:   
```json
{
  "name": "repeat",
  "js-hell": "IDL=1 repeat COUNT :: callback($1)" 
} 
```
$1 is realised as an ordinary javascript number - provided it's not too
big. But if `COUNT` is too big to be accurately represented as an
integer (e.g. `repeat 9007200254740992`) then an error will be thrown. 

However it can be cast via `toNumber()`  and `toBigInt()`. For example: 
```json
{
  "name": "repeat",
  "js-hell": "IDL=1 repeat COUNT :: callback($1.toNumber())" 
} 
```                                               

And now `repeat 9007200254740992` will be called with the
`Number(9007200254740992)`. (And so will `repeat 9007200254740993` be
called `9007200254740992` - because a double can't represent
`9007200254740993`.)

Alternatively, if this matters, cast it to BigInt.
```json
{
  "name": "repeat",
  "js-hell": "IDL=1 repeat COUNT :: callback($1.toBigInt())" 
}   
```
`repeat 9007200254740992` and  `repeat 9007200254740993` are now called
with `9007200254740992n` and `9007200254740993n`.

### Flying Monkeys
If you're a javascript programmer, you'll have heard of [monkey 
patching](https://en.wikipedia.org/wiki/Monkey_patch). (Don't do it,
kids. Just don't do it.)

A flying monkey is a monkey patch that doesn't land. Instead of patching
the object, there's a flying monkey that watches the object and swoops
in and steals the reference when you try to use it. But it exists only 
in js-hell's other-side-of-the-rainbow realm; so you may interact with 
the flying monkey's shadow, but never reach it.

Which is a poetic way of saying it's a API hack which is only available
from inside a js-hell binding. 

For example,
```json
{
  "name": "repeat"
  "js-hell": 
     "IDL=1 cmd URL :: default(fetch($url).buffer())" 
   
} 
```
`fetch()` returns a normal `Response` object. And no 
`Response.prototype.buffer` has been added. Instead a flying monkey 
swoops in and implements that convenience for you (a shortcut for
`Buffer.from(await fetch($1).arrayBuffer())`).

It some cases, flying monkeys can be whole types. For example, the 
`File` class is a flying monkey. If that's the case, the class will 
undergo [type realisation](#TypeRealisation) before being passed to your
code.


#### Current list of flying monkeys: 
  
| Function |  Code |
| -------- | ----- |
| Response.prototype.buffer | `() => Buffer.from(await this.arrayBuffer())` | 
| Iterator.prototype.map | `function*(callback){for (const value of this) yield callback(value)}` |


### @option decorator (aka 'Inline Options')
The `@option` "decorator" can be used in the bindings to create options
without declaring them in the usage. For example:

```js
export const js_hell = `IDL=1 
cmd :: 
default( @option(File) file, @option count = 4, { @option flag = false })` 
```
is equivalent to:
```js
export const js_hell = `IDL=1 
cmd [--count=INT] [--flag] --file=FILE  
:: default( file, count = 4, { flag })` 
```   

`@option` decorates the _identifier_; so for example:
```js
export const js_hell = `IDL=1
cmd 
:: default( {useThing: @option thing } )`
```
is fine.

The argument to the `@option` decorator is the options type. If you
default an option, the types must agree. {[@OPTION-TYPEMATCH]} For
example, this is illegal:

```js
export const js_hell = `IDL=1 cmd :: default(@option(String) foo = 4)`;
```


<!-- Proposed shortening:
```
export const js_hell = `IDL=1 cmd :: default( @<File> file, @: count = 4, { @: flag = false })` 
```

The reason for using a decorator is it migth oneday become legal in js -
although not under the current proposal - and we can then read the
source... -->

## Globals Objects 
### Invocation Globals
These globals are available to scriptlets that are executed by js-hell.
#### Console
All scripts executing under js-hell, have `globalThis.console` remapped
to a subtyped version of node's Console class. All messages are written
to `stderr` (whereas, on node, some console messages write to stdout and
some to stderr). See [`--log=FILE`]() on how to remap this

It adds three new method:

##### `console.status?.( [data],[...args] )`
`console.status?.()` writes a single line "status" message to the output
stream.  
 
When writing to the screen, the status message overwrites previous
status messages, but isn't overwritten by other log messages (which
appear above it).

When console is writing to a file, this message is **not** recorded - 
unless `console.statusFlush?.()` is called.

It's intended to give feed back to the user on what the script is doing
(e.g. the number of bytes downloaded or the percentage of the job
complete).

If a scriptlet executes successfully, `console.statusClear()` is called.
If an error occurs, `console.statusFlush()` is called.

You should always call this as `console.status?.()` so that your script
works with non-js-hell implementations.

##### `console.statusClear?.()`
Erases the status message.

##### `console.statusFlush?.()`
This "flushes" the current status message to the regular log and clears
the status line. (If console is writing to a file, then the message will
be written to the log. When writing to the terminal, it will start
scrolling up the screen and new status and log messages will appear
below it.)

Use this once a task has completed to record the final state (e.g. the
bytes downloaded). (Although a more robust implementation would call
`console.statusClear?.()` and then use `console.log()` to record a
message that all consoles can use.)
  
    
### Bind Globals  
The following variables are available during invocation:

#### `EOL` 
Set to the OS line ending. (?To do: --output-line-separator?)

#### `fetch`
js-hell has a very hacked implementation of fetch that can handle file
urls. This is used internally. And, if needed, it can be passed through
as an argument.

```js 
//! examples/cat.mjs
export const js_hell = "IDL=1 cat FILENAME :: default($1.toURL(),{fetch})";

export default async function cat( url, {fetch} ) {
    return await (await fetch(url)).text();    
}
```

#### `sessionId`
This is always set to the NIL UUID
`00000000-0000-0000-0000-000000000000` (Although that may change in the
future.) It's provided for compatibility with the web host, `xwh`. 
 


[<ArrayBuffer>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer
[<Buffer>]: https://nodejs.org/api/buffer.html#buffer
[<Uint8Array>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array
[<string>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#string_type


 

