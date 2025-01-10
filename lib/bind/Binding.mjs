import _parse,{isVoidTypeAssertion,validateAndExtractOptionNames,PARSE_AS_EXPR,PARSE_AS_BINDING,PARSE_AS_TEMPLATE_CONTENTS,PARSE_AS_EMBEDDED_EXPR,PARSE_AS_TEMPLATE_TAIL} from "./_parse.mjs";
import {_buildInvocation} from "./buildInvocation.mjs";
import {TYPE_VALUE,TYPE_METHOD,isLiteral} from "./ast.mjs";
import Instr from "../Instr.mjs"; //< Do we really need this dependency?
import renameReferences from "./renameReferences.mjs";

// 2024_10_16: To be removed when the min version we support supports iterator functions.
function 
Iterator_every( iterable, callback ) {
    for ( const item of iterable ) {
        if ( !callback( item ) )
            return false;
    }
    return true;
}
 
export default class
Binding {
    
    #ast;                     //< A single AST node describing the expression.
    #imports;                 //< String[]: identifiers that are imported. 
    #void;                    //< bool: true if we can prove there is no return value, e.g. output capture, declared with void, etc.. 
    #typeAssertion;           //< <string basename, <AS_ASYNC_ITERATOR|AS_ITERATOR|AS_ARRAY|AS_SCALAR> enum>: The `as` clause 
    #globalReferences;        //< A map with the global identifiers as keys, and the values a `Set` of AST nodes where they are referenced.
        
    globals;                  //< String[]: An array of the names of all 'global' (i.e. a list of undeclared identifiers).
    
    inlineOptions;            //<string name,bool hasExplicitTypename,string typename,bool hasDefaultValue,<string|number|bool|undefined|null> defaultValue>[] An array of the @option declarations: 
    
    // Historic:
    get name() {
        return this.#imports;
    }
    get args() { return this.#ast }
    get cast() { return this.#typeAssertion }
    get void() { return this.#void || isVoidTypeAssertion( this.#typeAssertion  ) }

    // To replace `args`. 
    get astNode() {
        return this.#ast 
    }
    // To replace `name`
    get imports() { return this.#imports }
    
    // Ideally private. But...
    constructor({importReferences,globalReferences,imports,args,typeAssertion,inlineOptions,isVoid}) {
        this.#ast = args;
        this.#imports = imports;
        this.#typeAssertion = typeAssertion;
        this.#globalReferences = globalReferences;
        this.#void = isVoid;
        this.globals = new Set( globalReferences.keys() );
        this.inlineOptions = inlineOptions;
    } 
    
    static 
    from( instrOrText, { expr = false } = {} ) {
        // FIXME: what are the whitespace characteristics for Instr?
        // Does anybody actually use `expr`?
        const instr = typeof instrOrText === 'string' ? new Instr( instrOrText ) : instrOrText;
        return new Binding( _parse( instr, expr ? PARSE_AS_EXPR : PARSE_AS_BINDING ) );
    }

    /// @brief Process the text as an expression, stopping at the first unprocessed char.
    /// Used for `${}` on the command line. 
    static 
    fromEmbeddedExpr( instrOrText ) {
        const instr = typeof instrOrText === 'string' ? new Instr( instrOrText ) : instrOrText;
        return new Binding( _parse( instr, PARSE_AS_EMBEDDED_EXPR) );
    }
    
    /// @brief Process the whole remaining string as if it were a template. Used for the 
    /// `template` built in that reads a file. 
    static 
    fromTemplateContents( instrOrText ) {
        const instr = typeof instrOrText === 'string' ? new Instr( instrOrText ) : instrOrText;
        return new Binding( _parse( instr, PARSE_AS_TEMPLATE_CONTENTS ) );
    }
    
    /// @brief Process text as a template through to next `` ` ``. Used for templates on the
    /// command line. 
    static 
    fromTemplateTail( instrOrText ) {
        const instr = typeof instrOrText === 'string' ? new Instr( instrOrText ) : instrOrText;
        return new Binding( _parse( instr, PARSE_AS_TEMPLATE_TAIL) );
    }
     
    // 2024_11_27: Residual, in case the test cases have missed covering something.
    get build( ) {
        throw new Error( "Not implemented" );
    }
    
    /// @param `globals` <Map> The global namespace objects.
    /// @param `imports` <Object> A "dictionary" of the imports. In all likelihood this is a module
    ///                  that has been imported. And that's why it makes sense to have it as a dictionary
    ///                  and not a map.
    /// @return THIS MAY BE A PROMISE. It almost certainly will be for the old format. But true expressions
    /// may escape it. 
    exec( globalsMap, imports, { throwError = true, legacyBrk = false } = {} ) {
        // FIXME: legacyBrk to be renamed `breakOnImport` and handled by buildInvocation.
        return _buildInvocation( this, globalsMap, undefined, throwError, imports );
    }
    static #defaultValueNode( binding, name ) {
        if ( !binding.#globalReferences.has( name ) )
            return null;
        const references = binding.#globalReferences.get( name );
        if ( references.size !== 1 )
            return null;
        const node = references.values().next().value;
        if ( typeof node.defaultValue === 'undefined' )
            return null;
        if ( node.defaultValue.type !== TYPE_VALUE )
            return null;
        return node.defaultValue;
    }
    
    hasDefault( name ) {
        return Binding.#defaultValueNode( this, name ) !== null;
    }
    getDefault( name ) {
        return Binding.#defaultValueNode( this, name )?.value;
    }
    *globalsWithLiteralDefaults() {
        for ( const [name,references] of this.#globalReferences.entries() ) {
            console.assert( references.size !== 0, "expected non-zero references to global %s", name );
            // 2024_10_16: Don't yet use iterators. (GLIIITCCHHHH!!!!)
            if ( !Iterator_every( references.values(), node => typeof node.defaultValue !== 'undefined' && node.defaultValue.type === TYPE_VALUE ) )
                continue;
            const values = references.values();
            const firstValue = values.next().value.defaultValue.value;
            if ( !Iterator_every( values, node => node.defaultValue.value === firstValue ) )
                continue;
            yield [ name, firstValue ];
        }
    }
    options() {
    }
    
    /// @brief Check whether a global referenced.
    hasGlobal( name ) {
        return this.#globalReferences.has( name ); 
    }
    /// @brief Return a `VarBinding` describing how a global is used (or null if no such global.)
    getGlobal( name ) {
        if ( !this.#globalReferences.has( name ) )
            return null;
        const v = new VarBinding;
        for ( const astNode of  this.#globalReferences.get( name ) ) {
            if ( !astNode.parent || astNode.parent.type !== TYPE_METHOD ) {
                v.othersCount++;
            } else {
                v.methods.add( astNode.parent.name );
            }
        } 
        return v;
    }
    
    /// @brief The is one giant hack used to map "$-" onto "input". We could do it during
    /// read - but that's a lot of overhead for something we want to delete, really.
    remapGlobals( currentName, newName ) {
        if ( renameReferences( this.#globalReferences, currentName, newName ) ) {
            this.globals = new Set( this.#globalReferences.keys() );
            // inline options may have just been broken, too.
            this.inlineOptions = validateAndExtractOptionNames( this.#globalReferences );
        }
    }
     
    /// @brief Return true if the ast is a single literal value.
    ///
    /// Probably should be replaced with `isConstexpr()` and then we can
    /// use `exec()` to evaluate it. (An `isPure()` would be nice as well.)
    ///
    /// And, actually, as isConstexpr() is just "does this reference any
    /// imports/globals." Well, except for lookups on arrays or objects;
    /// exclude method calls and we should be safe. (But whitelist `Array.prototype.join`
    /// so that template strings work. )
    isLiteral() { return isLiteral( this.#ast ) }
    
    /// @brief Return the value - if it's a literal. i.e. this should
    /// be the answer to exec() if `isLiteral()` returns true.  
    ///
    /// Q: Should this exist? If we are a literal (or a constexpr)
    /// then calling `exec()` will return the value. 
    toLiteralValue() { 
        if ( !isLiteral( this.#ast ) )
            throw new Error( "Not a literal" );
        return this.#ast.value;
    } 
};

/// @brief Eventually make this a fuller diagnostic of how a variable is used. 
/// static property access, dynamic propery access, as a value, as a function.
///
/// e.g. Number, `Number()`, `new Number()`, `Number.MAX_SAFE_INTEGER`, `Number.isFinite()`
class VarBinding {
    methods = new Set;    //< If its used as `this`, then these are the methods that are invoked on it.
    othersCount = 0;      //< Number of times its used which aren't a method call. 
};
