Road Map
=========
What gets added next depends on what I need next. But the 
  
## CLI   
  
 * Implement `$()` within templates (`` js-hell echo1 `Answer=$(cmd)`
   ``) and on the command line (`js-hell echo $(cmd)`)

 * Better support for the implicit subshells that do exist and full
   subshells.
  
 * Non-file based piping with '|>` and '%' on the command-line; e.g.
   `cmd |> other-cmd %`
  
 * Switch to node's glob routines, where available and enable the cp
   etc... builins.
  
 * Output formatting needs a massive overhaul. It comes from a time when
   js-hell was far less fully features. Now we can do sensible casting.
  
  
## Usage
 * Usage syntax tree, so that you can have sub cmds and other
   conditionals: 
  
```
IDL=x
blog --delete :: with(rm) rm() ;;
blog [--title=TITLE] BODY_TEXT :: with(add) add($1,{title=''})    
```
  
  * Ability to annotate positionals.
   
## Binding
 * Arithmetic operators. (I didn't want the complexity for what was
   supposed to be just a simple description. But...)
 * Comments! 
 * The ability to annotate options from the binding as well as the
   usage.     
 * Virtualisation - into vms, shadow realms, or workers. Scriptlets are
   supposed to be modules, so cooperative; but it would be nice to have
   stronger isolation.   
