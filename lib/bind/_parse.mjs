/**
    Parser for our "javascript-like" function-invocation syntax. 
     
    This meant to be close to javascript. But will never, ever, EVER, be
    full javascript. This is not the place for javascript. It is a javascript-like
    data description language/interface definition language that describes how to
    invoke a javascript function. 
    
    It shouldn't do data processing because there's no way to debug it.  And we
    want to be able to inspect these structures and compare them with the usage.
    
    Likewise there are lots of pointless things we don't support. (`[0][0]`, `x ?? 4 ?? y`
    `undefined.p` ) And the only operators we support are '.', '[]', '??'  
    
    If it looks like we need full support then there's an issue with either the user's 
    API or js-hell's is borked and needs revising.

    // 2024_11_27: Need to double check this matches below. 
     
    Rough grammar:

    IdentifierChain:: 
            identifier                                // This isn't actually used. We treated MemberExpr as a cover grammar
            IdentifierChain '.' identifier            // we refine with this where necessary.

    

    Subscript:: 
            '[' int ']'
            '[' String ']'
            '[' PipeExpr ']'
    
    Topic::
            '%'         
            '%' DIGIT +  

    LiteralExprList::                         // This is `Expr` in JS
            LiteralExpr                       // 
            LiteralExprList ',' LiteralExpr
    
    DecoratedIdentifier
            identifier
            '@' 'option' identifier
            '@' 'option' '(' identifier ')' identifier              // FIXME: we should allow `@option( string[] ) names`? And the brackets should be the same type that's used with 'as'

    ParenthesizedExpr::                                            
            '(' LiteralExprList ')'                                 // This was a hack, as I reall. Do away with it.
            DecoratedIdentifier
            identifier
            Topic
            LiteralExpr                                           // All literals should be allowed here. But it's tied up with defaulting, etc...
        
    CallExpr::
                 identifier ArgumentList
    
    MemberExpr:: 
                 ParenthesizedExpr                     
                 CallExpr                           // Yes we deliberately block `x()()` and kin. Give me a good reason for it and we'll talk.
                                                    
                 MemberExpr '.' identifier
                 MemberExpr '.' CallExpr           // And we also block `y.x()()`  
                 MemberExpr Subscript
                 'new' CallExpr                               // Should we allow `new identifier` and `new IdentifierChain`                   
                 'new' IdentifierChain '.' CallExpr                  

    
    CallbackTailExpr ::
                 // '=>' SimpleLiteralValue                // Is this ever constructive? 
                 // '=>' '(' ObjectLiteral ')'                // This is here because ParenthesizedExpr is Expr, not Arg or something. 
                 '=>' StatementExpr

    IdentifierList::
                identifier
                IdentifierList ',' identifier

    SyncCallbackExpr::
                '(' IdentifierList ')' CallbackTailExpr    // FixMe: should be defaultable...  
                identifer CallbackTailExpr
        
    CallbackExpr::
                 SyncCallbackExpr
                 'async' SyncCallbackExpr    // Do we nee `async*`?
                       
    UnaryExpr::                                                  
                 MemberExpr                 
                 
                 'await' MemberExpr       // Does `await await x` make sense? 
                 '*' MemberExpr           // `**x` definitely doesn't make sense.                    
                 'async' '*' MemberExpr
                 
                 '!' UnaryExpr            
                 'typeof' UnaryExpr                 
                  
    RelationalExpr::
                 UnaryExpr
                 UnaryExpr instanceof IdentifierChain  // We deliberately damp this down on the RHS.  
    
    EqualityExpression::
                 RelationalExpr
                 EqualityExpression '===' RelationalExpr   
                 EqualityExpression '!==' RelationalExpr   

    LeftExpr::
                 RelationalExpr
    
    RightExpr::     
                 '??' Arg                          // This means you can never write `y ?? 4 ?? x` 
                 
    Expr::
                 LeftExpr
                 LeftExpr RightExpr
    
    ConditionalExpr::
                 Expr 
                 Expr '?' Arg ':' Arg              // Should this allow defaulted Args. (No, probbably not.)
    
    PipeExpr::
                 ConditionalExpr 
                 ConditionalExpr '|>' PipeExpr   // Should this allow defaulted Args?
        
    
    ArgumentList::
                 '(' ')'
                 '(' ArrayList ')'
    
    
    ArgumentExpr::
                    
            SimpleLiteralValue   // These should all be Expr. There's no reason to exclude them.
            ArrayLiteral
            ObjectLiteral
            DefaultableExpr

    Arg::
            ArgumentExpr

    ArrayArg::         
                Arg
                '...' Arg    // This allows ...x = 4, which makes no sense, does it? Should we block by using LiteralExpr here?
                // 'async' /( No '*' allowed here )/ Arg  // async *x is resolved as `(async *)x` not `async(*x)`
                                                        // `async(async *)` only just about makes sense - an async iterator stored in a promise.
                /// FIXME: CallbackExpr is currently Arg '=> ... Not this.
                CallbackExpr                   // ONLY when Arg appears in CallExpr
                // async CallbackExpr          // ONLY when Arg appears in CallExpr 
                // 'async' '*' CallbackExpr    // ONLY when Arg appears in CallExpr 
    
    ArrayList::    
                ArrayArg
    ArrayList::
                ArrayList ',' ArrayArg 

    ArrayLiteral::
                '[' ']'
                '[' ArrayList ']'
                '[' ArrayList ',' ']'
                         
    DefaultableExpr:: 
            IdentifierChain '=' SimpleLiteralValue  
            PipeExpr
    
    LiteralExpr::              // This is Probably `AssignmentExpr`
           SimpleLiteral
           ArrayLiteral
           ObjectLiteral
           PipeExpr

    StatementExpr::              // Expression that can turn up as a "statement". 
                                 // Specifically in a function; i.e. `LiteralExpr EXCLUDING ObjectLiteral`
           SimpleLiteral
           ArrayLiteral
           PipeExpr

                              

*/
import json_q from "../utils/json_q.mjs";
import { AS_ASYNC_ITERATOR, AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./consts.mjs";
import {TYPE_LOOKUP,TYPE_ARRAY,TYPE_OBJECT,TYPE_BINARY,TYPE_UNARY,TYPE_METHOD, TYPE_CALL,
        UNARY_INDEX, UNARY_SYNC, TYPE_VALUE, UNARY_TYPEOF, UNARY_LOGICAL_NOT,
        BINARY_ALT, BINARY_SUBSCRIPT, BINARY_PIPE, BINARY_COMMA, BINARY_TYPE_ASSERTION, BINARY_INSTANCEOF,
        BINARY_EQUALS, BINARY_NOTEQUALS,  
    createAwait, createBinary, createDynamicCast, createLookup,
    createSubscript, createLiteral, createTernary, createRest,
    createCall, createMethod, createCallback, createObjectLiteral,
    createCapture, createUnary, createArrayLiteral,

     
    SCOPE_GLOBAL, SCOPE_IMPORT, SCOPE_LOCAL,
    
    sameValue as Ast_sameValue
    
} from "./ast.mjs";
import createLocal from "./createLocal.mjs"; // Shoul we put this in the AST?
import Keyword from "./Keyword.mjs";
import Instr from "../Instr.mjs";
import ExprType from "./ExprType.mjs";

const CAST_DYNAMIC = "to",
      CAST_STATIC = "as";

const RE_JS_IDENTIFIER = /\$-|[A-Za-z_$][A-Za-z_$0-9]*/y,        // These are wrong. JS is more tolerant. We explicit allow $-
      RE_DICT_IDENTIFIER = /[A-Za-z_][A-Za-z_$0-9]*/y,
      RE_KEYWORD_ASYNC = /async(?![A-Za-z_$0-9]|\s*\*)/y,
      RE_OPERATOR_ASSIGNMENT = /=(?![=>])/y,
      RE_PARENTHESIZED_OBJECT_LITERAL = /\((?=\s*\{)/y, 
      
      RE_NUMBER = /[-+]?\d+/y,
      RE_INT    = /[-+]?\d+/y,
      RE_TOPIC = /%\d*/y,
    
      RE_DQSTR_CHUNK = /[^"\\\r\n\u2028\u2029]+/y,
      RE_SQSTR_CHUNK = /[^'\\\r\n\u2028\u2029]+/y,
      RE_STR_QUOTED_LITERAL = /['"\\]/y,
      RE_STR_EOL = /[\n\u2028\u2029]|\r\n?/y,
      RE_STR_NAMED_ESCAPE = /[bfnrtv]/y,
      RE_STR_UNICODE_ESCAPE = /u[0-9A-Fa-f]{4}/y,
      RE_NON_INDEFINITE_SQUARE_KET = /\[(?!\s*\])/y,
      RE_TERNARY = /\?(?!\?)/y,
      PIPE_OPERATOR = "|>",
      RE_TEMPLATE_CHARACTERS = /[^`\\$\r\n\u2028\u2029]*/y,
      RE_LINE_TERMINATOR_SEQUENCE = /[\n\u2028\u2029]|\r\n?/y,
      RE_SINGLE_ESCAPE_CHARACTER = /['"\\bfnrtv]/y,
      // It makes sense to deal with these two cases together.
      RE_HEXDIGITS_ESCAPE_TAIL = /x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}/y, 
      RE_UNICODE_ESCAPE_TAIL = /u\{[0-9A-Fa-f]+\}/y; 
      
const PS = '\u2029', // paragraph separator
      LS = '\u2028'; // line separator

export const ERROR_MISMATCH = "every reference";

function
isUnsubscriptedOrIndefinite( node ) {
    if ( node.type === TYPE_LOOKUP )
        return true;
    if ( node.type === TYPE_UNARY && node.op === UNARY_INDEX )
        return typeof node.property === 'undefined' && typeof node.property.start === 'undefined' && typeof node.end === 'undefined';
    return false;
}

/// Cover grammar?
function
isIdentifierChain( node ) {
    let name = "";
    for ( ;; ) {
        if ( node.type === TYPE_LOOKUP )
            return name || node.name;
        if ( node.type !== TYPE_UNARY || node.op !== UNARY_INDEX )
            return "";
        if ( typeof node.property !== 'string' || typeof node.property.start !== 'undefined' || typeof node.end !== 'undefined' )
            return "";
        
        // Does this matter for shorthands. Just that it has a rightside as a simple string?
        // e.g. `( await x ).something().wibble`? Could we even allow casting?
        if ( !name )
            name = node.property;
        node = node.object;
    }
}

function
readIdentifierChain( instr, context ) {
    let node = readScopedIdentifier( instr, context ); 
    while ( instr.match( ".", true ) ) {
        const identifierName = _readIdentifier( instr, context );
        const child = node;
        node = createSubscript( child, identifierName );
        // Enable us to see that properties are being used of this object.
        if ( child.parent === null ) {
            child.parent = node;
        }
    }
    return node; 
}

// 2022_10_18: cover grammer - see if we have `identifier` or `IdentifierList` 
function
toArgumentNameList( node, context, deleteFromGlobals = true ) {
    // FIXME: we need to extract defaulting for real...
    // FIXME: trailing commas should be allowed, but we don't permit that with this approach.
    if ( node.type === TYPE_BINARY ) {
        if ( node.op !== BINARY_COMMA )
            return null;
        // 2024_5_29: Silly way to do this. But it shouldn't be a huge list.
        const lhs = toArgumentNameList( node.lhs, context, deleteFromGlobals ),
              rhs = toArgumentNameList( node.rhs, context, deleteFromGlobals );
        if ( !lhs || !rhs )
            return null;
        return [ ...lhs, ...rhs ]; 
    } else if ( node.type === TYPE_LOOKUP ) {
        if ( deleteFromGlobals ) {
            Scope_delete( context, node );
        } 
        return [ node.name ];
    } 
    return null;
}

function 
readStringTail( instr, chunk, quote ) {
    let str = '';
    for ( ;; ) {
        str += instr.match( chunk, false );
        if ( instr.match( quote, true ) ) {
            return str;
        }
        if ( !instr.match( "\\", false ) ) 
            throw instr.error( "Unterminated string" );
        let escape;
        if ( "" !== ( escape = instr.match( RE_STR_QUOTED_LITERAL, false ) )) {
            str += escape;
        } else if ( "" !== ( escape  = instr.match( RE_STR_UNICODE_ESCAPE, false ) )) {
            str += String.fromCharCode( parseInt( escape.slice( 1 ), 16 ) );
        } else if ( "" !== ( escape = instr.match( RE_STR_NAMED_ESCAPE, false )  )) {  
            const i = "bfnrtv".indexOf( escape );
            str += "\b\f\n\r\t\v".charAt( i );
        } else if ( "" !== instr.match( /[x0-9]/y, false ) ) {
            // We are missing decimal, octal and legacy escapes 
            throw instr.error( "unsupported escape sequence" );
        } else {
            // The escape is always omitted and, if followed by an eol, that is
            // omitted, too.
            instr.match( RE_STR_EOL, false );
        } 
        
    }
}

function 
optionallyReadString( instr ) {
    if ( instr.match( '"', false ) !== "" ) {  
        return createLiteral( readStringTail( instr, RE_DQSTR_CHUNK, '"' ) );
    } else if ( instr.match( "'", false ) !== "" ) {  
        return createLiteral(  readStringTail( instr, RE_SQSTR_CHUNK, "'" )  );
    } else {
        return null;
    }
}

function 
optionallyReadSimpleLiteral( instr, context ) {
    let token, stringNode, templateNode;
    if (( token = instr.match( RE_NUMBER, true ) ) !== "" ) {
        return createLiteral(  parseFloat( token )  );
    } else if (( stringNode = optionallyReadString( instr )  )) {
        return stringNode;
    } else if (( templateNode = optionallyReadTemplate( instr, context )  )) {
        return templateNode;
    } else if ( instr.match( "true", true ) !== "" ) {
        return createLiteral(  true  );
    } else if ( instr.match( "false", true ) !== "" ) {
        return createLiteral(  false  );
    } else if ( instr.match( "null", true ) !== "" ) {
        return createLiteral(  null  );
    } else if ( instr.match( "undefined", true ) !== "" ) {
        return createLiteral(  undefined );
    } else {
        return null;
    }
}
function 
optionallyReadArraySubscript( instr, context ) { 
    if ( !instr.match( RE_NON_INDEFINITE_SQUARE_KET, true ) )
        return;
    
    let result, stringValue
    if (( stringValue = optionallyReadString( instr, context )  )) {
        result = stringValue.value;
    } else {

        // The advantage of passing this as an int is we can spot errors earlier.
        const numberString = instr.match( RE_INT, true );
        if ( numberString !== '' ) {
            result = parseInt( numberString, 10 );
        } else {
            result = readPipeExpr( instr, context );
            // throw instr.error( "expected number (subscript must be a number of a a string)" );
        }
    }
    
    if ( !instr.match( "]", true ) )
        throw instr.error( "expected ']'" );
    instr.trimStart();
    return result;
}
function
applyArraySubscriptOrPropertyIndex( instr, node, context ) {
    if ( instr.match( ".", true ) ) {
        const identifier = instr.match( RE_JS_IDENTIFIER, true );
        if ( !identifier )
            throw instr.error( "expected identifier" );
        if ( !instr.match( "(", true ) ) 
            return createSubscript( node, identifier );

        const args = readArrayList( instr, ')', context );
        return createMethod( identifier, node, args );  
    }
    const s = optionallyReadArraySubscript( instr, context ); 
    if ( typeof s === 'undefined' )
        return node;
    // This means the subscript is an EXPRESSION, rather than
    // a property lookup. The latter is flagged as 'unary'
    // because it only depends on the object. 
    if ( typeof s === 'object' )
        return createBinary( BINARY_SUBSCRIPT, node, s );
    // Why is this not a weird unary operation.
    return createSubscript( node, s );
}

function
_readIdentifier( instr ) {
    const identifier = instr.match( RE_JS_IDENTIFIER, true );
    if ( !identifier ) 
        throw instr.error( "expected identifier" ); 
    return identifier;
}

// This could almost be a primary expression...
function
readIdentifier( instr ) {
    return createLookup( _readIdentifier( instr ) );
}
       
function
readScopedIdentifier( instr, context, options = {} ) {
    const name = _readIdentifier( instr ),
          scope = Scope_determine( context, name ), 
          identifierNode = createLookup( name, { scope, ...options } );
    Scope_addToScope( context, identifierNode, name, scope );
    return identifierNode; 
}       

function
optionallReadDecoratedIdentifierTail( instr, context ) {
    if ( !instr.match( "@" ) )
        return null;
    if ( !instr.match( Keyword("option") ) )
        throw instr.error( "@option is the only decorated currently supported" );
    let typename = '';
    if ( instr.match( "(", true ) ) {
        typename = _readIdentifier( instr );
        if ( !instr.match( ")", true ) ) {
            throw instr.error( "expected ')'" );
        }
    } else {
        instr.trimStart();
    }
    // This would be non mandatory and defaulted.
    // `API=1 CONFIG="~.package/.config" cmd :: default( @option(File) config )`
    const identifierNode = readScopedIdentifier( instr, context, { option: true, typename } );
    if ( identifierNode.scope !== SCOPE_GLOBAL )
        throw instr.error( "@option can only decorate globals" ); 
    return identifierNode;
}

function             
readParenthesizedExpr( instr, context ) {
    const node = optionallyReadSimpleLiteral( instr, context )
              || optionallReadDecoratedIdentifierTail( instr, context );
    if ( node )
        return node;
    if ( instr.match( '(', true ) ) {
        let node = readLiteralExpr( instr, context );
        while ( instr.match( ",", true ) ) {
            node = createBinary( BINARY_COMMA, node, readLiteralExpr( instr, context ) );
        }
        if ( !instr.match( ")", true ) ) 
            throw instr.error( "expected ')'" );
        return node;
    } else {
        const topic = instr.match( RE_TOPIC, true );
        if ( topic ) {
            // FIXME: we need to know we are in PipeBody - either
            // by being told or by checking it later. And we could do with checking the topic index is in range. 
            // (Although it could refer to an outer pipe?)
            //
            // 2024_6_11: the topic gets placed in the scope stack as a local, so this is correct.
            // Although perhaps not useful. 
            return createLookup( topic, { scope: SCOPE_LOCAL } );
        } else {
            const identifierNode = readIdentifier( instr );
            Scope_add( context, identifierNode );
            return identifierNode;
        }
    }
}

 
function 
Scope_replace( context, oldNode, newNode ) {
    if ( oldNode.scope === SCOPE_LOCAL )
        return;
    const map = oldNode.scope === SCOPE_GLOBAL ? context.globals :
                oldNode.scope === SCOPE_IMPORT ? context.imports :
                null;
    const references = map.get( oldNode.name );
    references.delete( oldNode );
    references.add( newNode );
    newNode.import = oldNode.scope === SCOPE_IMPORT;
}

// FIXME: this should be true for locals as well -- fortunately we don't track them.
function 
Scope_delete( context, oldNode ) {
    if ( oldNode.scope === SCOPE_LOCAL )
        return;
    const map = oldNode.scope === SCOPE_GLOBAL ? context.globals :
                oldNode.scope === SCOPE_IMPORT ? context.imports :
                null;
    if ( !map.has( oldNode.name ) )
        return;
    const references = map.get( oldNode.name );
    
    references.delete( oldNode );
    // 2024_6_12: to geneerate the set of output gloabls, we only look
    // at the keys. So this needs to be deleted if empty.
    if ( references.size === 0 && oldNode.scope === SCOPE_GLOBAL ) {
        map.delete( oldNode.name );
    }
}
function 
Scope_determine( context, name ) {
    return typeof context.locals?.[name] !== 'undefined' ? SCOPE_LOCAL :
           context.imports.has( name )                   ? SCOPE_IMPORT: 
                                                           SCOPE_GLOBAL;
}

function 
Scope_addToScope( context, identifierNode, name, scope ) {
    if ( scope === SCOPE_IMPORT ) {
        context.imports.get( name ).add( identifierNode );
    } else if ( scope === SCOPE_GLOBAL ) {
        if ( !context.globals.has( name ) ) {
            context.globals.set( name, new Set( [ identifierNode ] ) );
        } else {
            context.globals.get( name ).add( identifierNode );
        }
    }
}

function 
Scope_add( context, identifierNode ) {
    const {name} = identifierNode;
    const scope = Scope_determine( context, name );
    Scope_addToScope( context, identifierNode, name, scope );
    identifierNode.scope = scope;
}

function 
readMemberExpr( instr, context ) {
    const newPos = instr.pos;
    let wantNew = !!instr.match( Keyword( "new" ), true );
    let node = readParenthesizedExpr( instr, context );
    if ( node.type === TYPE_LOOKUP ) {
        if ( instr.match( "(", true ) ) {
            if ( node.option )
                throw instr.error( '@option can decorate function calls' );
            const nameNode = node;
            node = createCall( nameNode.name, readArrayList( instr, ')', context ) );
            node.new = wantNew;
            wantNew = false;
            Scope_replace( context, nameNode, node );
        }
    } else if ( wantNew ) {
        throw instr.error( "`new` not allowed here", newPos )
    }
    for ( ;; ) {
        const newNode = applyArraySubscriptOrPropertyIndex( instr, node, context );
        if ( wantNew ) {
            if  ( newNode.type === TYPE_METHOD ) {
                if ( !isIdentifierChain( newNode.object ) ) 
                    throw instr.error( "`new` not allowed here", newPos )
                newNode.new = wantNew;
                wantNew = false;
            } else if ( newNode === node ) {
                throw instr.error( "`new` not allowed here", newPos )
            } 
        } else if ( newNode === node ) {
            return node;
        }
        node = newNode;
    }
}

function
optionallyReadDefaultValue( instr, context )
    {
        if ( !instr.match( RE_OPERATOR_ASSIGNMENT, true ) )
            return null;
        const pos = instr.pos,
              result = optionallyReadSimpleLiteral( instr, context );
        if ( !result )
            throw instr.error( "expected literal", pos );
        return result;
    }


function
optionallyReadCastExpr( instr, castType = CAST_DYNAMIC )
    {
        if ( !instr.match( castType, true ) )
            return;

        const iteratorType = matchToken_iteratorType( instr );
        
        // FIXME: it should be an error if this doesn't reference this.
        let basetype = optionallyReadObjectLiteral( instr );
        if ( !basetype ) {
            // We might need to read the array type. e.g. File[] as Buffer[]
            basetype = instr.match( RE_DICT_IDENTIFIER, true );
            if ( !basetype )
                throw new TypeError( "Expected identifier" );
        }
        
        const array = matchToken_indefiniteArray( instr );
        if ( iteratorType !== AS_SCALAR && array )
            throw new TypeError( "Cannot be both iterator and array" );
        
        // Q: Should we have a separate AST node `{type:TYPE_CAST, source, basetype, enum}`
        // that we return, rather than chaining onto it?
        // Q: Should we outlaw `void*`,`undefined*`, etc... here.  
        return new ExprType( basetype, array?AS_ARRAY:iteratorType );
    }

function
matchToken_iteratorType( instr )
    {
        const async = !!instr.match( Keyword( "async" ), true );
        if ( instr.match( "*", true ) ) {
            return async ? AS_ASYNC_ITERATOR : AS_ITERATOR; 
        } else if ( async ) {
            throw instr.error( "expected '*' following 'async'" );
        } else {
            return AS_SCALAR;
        }
    }

// multiword arrays.
function
matchToken_indefiniteArray( instr )
    {
        if ( !instr.match( '[', true ) )
            return false;
        if ( instr.match( ']', true ) )
            return true;
        throw instr.error( "expected ']' following '['" );
    }

function
readAwait( instr, context ) 
    {
        const wait = instr.match( Keyword( "await" ), true ) === "await";
        if ( !wait )
            return false;
        if ( context.async !== true ) 
            throw instr.error( "await cannot be used outside of an async context" );
        return true;
    }

function 
readUnaryExpr( instr, context )
    {
        if ( instr.match( Keyword( "typeof" ), true ) ) 
            return createUnary( UNARY_TYPEOF, readUnaryExpr( instr, context ), { exprType: new ExprType( "string" ) } );
        if ( instr.match( "!", true ) )
            return createUnary( UNARY_LOGICAL_NOT, readUnaryExpr( instr, context ), { exprType: new ExprType( "boolean" ) } ); 
        
        const iteratorType = matchToken_iteratorType( instr ),
              // 2022_10_3: Should we check for await even if it's ruled out. `*await x`
              sync = iteratorType === AS_SCALAR && readAwait( instr, context );
        
        let node = readMemberExpr( instr, context );
        // 2022_10_3: Should we check for [] even if it it's ruled out?
        if ( sync ) 
            node = createAwait( node );
        else if ( iteratorType === AS_ITERATOR )
            node = createMethod( Symbol.iterator, node, [] );
        else if ( iteratorType === AS_ASYNC_ITERATOR )
            node = createMethod( Symbol.asyncIterator, node, [] );
        return node;
    }

function 
readRelationalExpr( instr, context ) {
    const lhs = readUnaryExpr( instr, context );
    if ( !instr.match( Keyword( "instanceof" ), true ) )
        return lhs;
    const typenameNode = readIdentifierChain( instr, context );
    return createBinary( BINARY_INSTANCEOF, lhs, typenameNode, { exprType: new ExprType( 'boolean' ) }  ); 
}

// FIXME: we're reaching the point we need an operator-precedence parser.
function 
readEqualityExpr( instr, context ) {
    let expr = readRelationalExpr( instr, context );
    if ( instr.match( "===", true ) ) { 
        expr = createBinary( BINARY_EQUALS, expr, readRelationalExpr( instr, context ), { exprType: new ExprType( 'boolean' ) } );
    } else if ( instr.match( "!==", true ) ) { 
        expr = createBinary( BINARY_NOTEQUALS, expr, readRelationalExpr( instr, context ), { exprType: new ExprType( 'boolean' ) } );
    } else {    
        return expr;
    }
    // `x === y === z` is almost certainly an error, so we prohibit it. It's in javascript for historic reasons
    // but you wouldn't put it in a new language; or, if you did, it would have the obvious semantics of all
    // three values are equal.
    if ( instr.match( "===" ) || instr.match( "!==" ) )
        throw instr.error( "another equality operator is not permitted here (without brackets)" );
    return expr;
}

const readLeftExpr = readEqualityExpr;

function 
readRightExpr( instr, node, context ) {
    if ( !instr.match( "??", true ) ) 
        return node;
    
    // 2022_9_26:
    // allow: `x ?? y`, `x[] ?? y`
    // prohibit: `x[4] ?? 5`, `x.y ?? 5`, `x.m() ?? 5`;
    // 
    // Most of these cases can never so are probably errors.
    // The grammar allows these. Should we remove that? e.g.
    // `cmd INT [INT] :: ( $[1], $[2] ?? 0 )`
    //
    // Also `x.y ?? z` should be `z` if `x` is missing.  
    //
    // It is hard to debug and we need to be error friendly.
    // (Except `await fileSystemDirectoryEntry.file() ?? x` can happen. 
    if ( false && !isUnsubscriptedOrIndefinite( node ) ) 
        throw instr.error( "Alternates not permitted here" );
    // Q: What is the case for `x ?? (...)`
    // A:  `x ?? await ( await $directoryEntry.file() ).text()`
    //
    // NB this means you can never right `x ?? 4 ?? something`
    const alternate = readArgumentExpr( instr, context );
    return createBinary( BINARY_ALT, node, alternate );
}

function 
readConditionalTail( instr, condition, context )
    {
        // Q: This means defaulting is permitted: e.g. `cond ? x = true : z = false`.
        //    Should we accept '=' as a more general synonym for '??' anywhere.  
        const trueExpr = readArgumentExpr( instr, context );
        if ( !instr.match( ":", true ) )
            throw instr.error( "expected ':'" );
        const falseExpr = readArgumentExpr( instr, context );
        return createTernary( condition, trueExpr, falseExpr );
    }

function 
readPipeExpr( instr, context, pipeIndex = 0 )
    {
        const conditionOrPipeHead = readRightExpr( instr, readLeftExpr( instr, context ), context );
        if ( instr.match( RE_TERNARY, true ) ) {
            if ( pipeIndex )
                throw instr.error( "cannot mix ternary and pipe expressions" ); 
            const result = readConditionalTail( instr, conditionOrPipeHead, context )
            // https://github.com/tc39/proposal-pipeline-operator prohibits us mixing them.
            if ( instr.match( PIPE_OPERATOR, true ) )
                throw instr.error( "cannot mix ternary and pipe expressions" );
            return result;
        // https://github.com/tc39/proposal-pipeline-operator
        } else if ( instr.match( PIPE_OPERATOR, true ) ) {
            const right = readPipeExpr( instr, context, pipeIndex + 1 );
            // The first is %1, %2, etc...
            // NB either here, or later, we need to check the topic has been used; 
            // watch for `thing1() |> ( thing2() |> % )` as only one topic is used. 
            return createBinary( BINARY_PIPE, conditionOrPipeHead, right, {pipeIndex: pipeIndex + 1} );
        } else {
            return conditionOrPipeHead;
        }

    }

function
readDefaultableExpr( instr, context )
    {
        const node = readPipeExpr( instr, context ),
              {pos} = instr,
              defaultValue = optionallyReadDefaultValue( instr, context );
        if ( !defaultValue )
            return node;
        if ( !isIdentifierChain( node ) )
            throw instr.error( "defaulting not permitted here", pos );
        if ( node.type === TYPE_LOOKUP ) {
            // Q: Should this be typename, or constructor? i.e. should the typeof of `string` be `String`?
            //
            // Q: What happens if they do `@option(Integer) x = 4?`
            //
            // Are these issues for the caller to sort out?
            if ( node.option && node.typename && typeof defaultValue.value !== node.typename ) {
                throw instr.error( "defaulted value must have the same type as is declared in the option", pos ); 
            }
            node.defaultValue = defaultValue;
            return node;
        } else {
            // We probbaly shouldn't allow defaulting here, but that's a
            // historical fact of API=1
            return createBinary( BINARY_ALT, node, defaultValue, { defaulted: true } );
        }
    }

function
isDefaultedExpr( node )
    {
        return node.type === TYPE_BINARY && node.op === BINARY_ALT && node.defaulted === true;
    }


function 
readArrayArg( instr, allowCallbacks, context )   
    {
        if ( instr.match( "...", true ) ) 
            return createRest( readArgumentExpr( instr, context ) );
        
        const isAsync = instr.match( RE_KEYWORD_ASYNC, true )?true:false,
              term = readArgumentExpr( instr, context ); // FIXME: bind can now handle a list of variables.
        if ( allowCallbacks ) {
            // Effectivelty, the cover grammar. But that means allowing lists in readArgumentExpr
            const argumentNameList = toArgumentNameList( term, context, false );
            if ( argumentNameList ) {
                const callback = optionallyReadCallbackTail( instr, context, isAsync, argumentNameList );
                if ( callback ) {
                    // NB This is now called with the last argument to `true`: because
                    // these are all local names so need to be removed from the global scope.
                    // (Two parses are currently unavoidable.)
                    toArgumentNameList( term, context, true );
                    return createCallback( argumentNameList, callback, isAsync );
                }
            }
        }
        if ( isAsync ) {
            throw instr.error( "cannot use async here" );
        }
        return term;
    }

function
readArrayList( instr, closingDelimiter, context )
    {
        const args = [];
        const allowCallbacks = closingDelimiter === ')';
        if ( !instr.match( closingDelimiter, true ) ) {
            for ( ;; ) {
                args.push( readArrayArg( instr, allowCallbacks, context ) );
                // Allow a trailing ',' before the closing delimiter.
                const comma = instr.match( ",", true ); 
                if ( instr.match( closingDelimiter, true ) ) 
                    break;
                if ( !comma )
                    throw instr.error( `expected ',' or ')'` );
            }
        }
        return args;
    }

function
optionallyReadArrayLiteral( instr, context )
    {
        if ( !instr.match( "[", true ) )
            return;

        const args = readArrayList( instr, ']', context );
        return createArrayLiteral(  args )
    }

function
optionallyReadObjectLiteral( instr, context )
    {
        if ( !instr.match( "{", true ) )
            return;
        const entries = [];
        if ( !instr.match( "}", true ) ) {
            for ( ;; ) {
                const {pos}=instr;
                const node = readDefaultableExpr( instr, context );
                let propertyName, propertyValue;
                if ( node.type === TYPE_LOOKUP && instr.match( ":", true ) ) {
                    Scope_delete( context, node );
                    propertyName = node.name;
                    propertyValue = readArgumentExpr( instr, context ); 
                } else {
                    const shorthandNode = isDefaultedExpr( node ) ? node.lhs : node,
                          shorthand = isIdentifierChain( shorthandNode );
                    if ( !shorthand )
                        throw instr.error( "cannot use argument as a shorthand", pos )
                    propertyName = shorthand;
                    propertyValue = node;
                }
                // 2022_9_20: I'm not sure why this was blacklisted. Is it because $, $1 etc.. are special and
                // need to be handled?
                if ( propertyName.indexOf( '$' ) !== -1 )
                    throw new TypeError( "Property name cannot contain `$`" );
                entries.push( [ propertyName, propertyValue ] );
                if ( instr.match( "}", true ) ) 
                    break;
                if ( instr.match( ",", true ) ) 
                    continue;
                throw instr.error( `expected ',' or '}'` );
            }
        }
        return createObjectLiteral( entries );
    }

function 
optionallyReadCallbackTail( instr, context, isAsync, argumentNameList )
    {
        if ( !instr.match( "=>", true ) )
            return;
        const newOptions = createLocal( context, [ 
            'async', isAsync,
            // Yes, this has a weird branching syntax!
            'locals', createLocal( context.locals, argumentNameList.flatMap( n => [ n, true ] ) ) 
        ] );
        return readStatementExpr( instr, newOptions );
    }

// Should we call this argumentExpr or something? It's something that can be defaulted.
function
readArgumentExpr( instr, context )
    {
        return optionallyReadArrayLiteral( instr, context ) 
            ?? optionallyReadObjectLiteral( instr, context )  
            ?? optionallyReadSimpleLiteral( instr, context )
            ?? readDefaultableExpr( instr, context ); 
    }

function
readStatementExpr( instr, context )
    {
        // We don't read object literals because this is for expressions e.g. `with() {}` looks 
        // like a statement  and whatever we read can't be defaultable.
        return optionallyReadArrayLiteral( instr, context ) 
            ?? optionallyReadSimpleLiteral( instr, context )
            ?? readPipeExpr( instr, context ); 
    }

function
readLiteralExpr( instr, context )
    {
        // We don't read object literals because this is for expressions e.g. `with() {}` looks 
        // like a statement  and whatever we read can't be defaultable.
        return optionallyReadArrayLiteral( instr, context ) 
            ?? optionallyReadObjectLiteral( instr, context )   
            ?? optionallyReadSimpleLiteral( instr, context )
            ?? readPipeExpr( instr, context ); 
    }

function
readIdentifierListTail( instr ) 
    {
        const result = [];
        for ( ;; ) {
            // Putting this inside the loop allows trailing commas.
            if ( instr.match( ")", true ) )
                return result;
            result.push( readIdentifier( instr ).name );
            if ( instr.match( ")", true ) )
                return result;
            if ( !instr.match( ",", true ) )
                throw instr.error( "exepcted ','" ); 
        }
    }


const voidTypes = [ "void", "undefined", "null" ];
export function
isVoidTypeAssertion( typeAssertion ) {
    return typeof typeAssertion !== 'undefined' && voidTypes.includes( typeAssertion.basetype );
}


/// @brief Scan the global and find those objects which have at least one option node.
/// Ensure that all are declared as options, with matching declaration. Return the result.
export function 
validateAndExtractOptionNames( globals ) {
    const result = [];
    for ( const [name,nodes] of globals ) {
        const nodeIterator = nodes[Symbol.iterator]();
        const first = nodeIterator.next();
        if ( first.done ) {
            // Probably legal?
            throw new Error( json_q`No options for global ${name}` );
        }
        if ( !first.value.option ) {
            if ( !Array.from( nodeIterator ).every( n => !n.option ) ) {
                // FIXME: we need AST to have positional information.
                throw new Error( json_q`Every reference to ${name} must be declared an option` );
            }
            continue;
        }

        // Q: why are we doing this in a separate pass? Wouldn't it be better to do it
        // when we add an option? Then we have the positional info, too.
        //
        // A: defaultValue happens after the declaration, so we would have to do that
        // later. (We could change that?)
        for ( const node of nodeIterator ) {
            if ( !node.option )
                throw new Error( `${ERROR_MISMATCH} to ${JSON.stringify(name)} must be declared an option` );
             if (  node.typename !== first.value.typename )
                throw new Error( `${ERROR_MISMATCH} to ${JSON.stringify(name)} must be declared with the same type` );
            if ( !Ast_sameValue( node.defaultValue, first.value.defaultValue  ) ) 
                throw new Error( `${ERROR_MISMATCH} to ${JSON.stringify(name)} must have identical default value` );
        }
        // 2024_7_15: I beleive this is blocked already. But this is a double check since we depend on it.
        if ( first.value.defaultValue && first.value.defaultValue.type !== TYPE_VALUE )
            throw new Error( "@option can only be declared with literal values." );
        const hasExplicitTypename = !!first.value.typename,
              hasDefaultValue = !!first.value.defaultValue; 
        result.push( { 
            name,
            hasExplicitTypename,  
            typename: hasExplicitTypename ? first.value.typename 
                    : hasDefaultValue ? typeof first.value.defaultValue.value
                    : '',
            hasDefaultValue, 
            defaultValue:first.value.defaultValue?.value} );
    }
    return result;
}

// 2024_8_16: Exported for testing.
export function
unwrapSingleImport( node ) {
    if ( node.type === TYPE_BINARY && node.op === BINARY_TYPE_ASSERTION ) {
        node = node.lhs;
    }
    if ( node.type !== TYPE_UNARY || node.op !== UNARY_SYNC ) {
        throw new Error( "expected root to be an await()" );
    }
    const {object}=node;
    if ( typeof object === 'undefined' 
         || object.type !== TYPE_CALL  )
        throw new Error( "expected await to wrap a call" );
    if ( object.import !== true )
        throw new Error( "expected call to be an import" );
    return object;
}

export function
wrapSingleImport( name, argNodes ) {
    return createAwait( createCall( name, argNodes, { import: true } ) );
}

function 
buildTypeAssertion(basetype, context) {
    let checkExpr;
    if ( basetype.charAt( 0 ).toUpperCase() === basetype.charAt( 0 ) ) {
        // 1. call `X.isX` first - e.g. for Array. 
        // 2. Then do an instanceof checked.
        // NB This is idiomatic js-hell, in ecmascript it would be
        // `${basetype}.is${basetype}?.(%) ?? % instanceof ${basetype}`
        // And even that is probably wrong - although maybe useful.
        // And a sign NanO maybe a wrong turn.
        // Probbaly we want: `typeof ${basetype}.is${basetype} === 'function' ? ${basetype}.is${basetype}(%) : % instanceof ${basetype}`;
        // Q: do we want sensible error messages if basetype doesn't exist?  
        // We could almost do it with `${basetype},...` (A nano in the first arg
        // is propogated.) Ideally it would be 
        // `const (value=%) ${basetype} |> ( typeof %.is${basetype} ? %.is${basetype}(value) : value instanceof %`
        // i.e. do the lookup once.    
        checkExpr = `${basetype}.is${basetype}(%) ?? % instanceof ${basetype}`;
    } else if ( basetype.toLowerCase() === basetype ) {
        checkExpr = `typeof % === ${JSON.stringify( basetype)}`;
    } else {
        checkExpr = "0";
    }
    const node = readLiteralExpr( new Instr(checkExpr), context );
    return node;
}

export const 
PARSE_AS_EXPR     = "expr",            //< The bit that follows `with()` (Should this allow arrow assignment?)
PARSE_AS_EMBEDDED_EXPR = "embedded",   //< An expression, and we don't swear if it doesn't terminate at EOF - it's less to
                                       // you to trim.
PARSE_AS_BINDING  = "binding",         //< Require `with()` or a single function call that is imported; i.e. parse as statement.
PARSE_AS_TEMPLATE_CONTENTS = "template", //< A template, stopping at EOF.
PARSE_AS_TEMPLATE_TAIL = "template-tail"; //< A template, stopping at `` ` `.  

export default function 
_parse( instr, parseAs = PARSE_AS_EXPR )
    {
        if ( typeof parseAs === 'boolean' )
            console.warn( "_parse invoked with boolean - upgrade to a const" );
        if ( parseAs === true )
            parseAs = PARSE_AS_EXPR;
        else if ( parseAs === false )
            parseAs = PARSE_AS_BINDING; 
        const context = { 
            api: 1, 
            async: true,                    //< Async context; i.e. await allowed. 
            globals: undefined,             //< Map referneces all undefined varibles implied intot he global scope. 
            imports: undefined,             //< Map references all imports.  
            locals: createLocal( null, [] ) //< null-rooted Object where properties are locals.  
        };
        // `statement` may be misleading: but this must start with a `with` clause or be a function call;
        // and, if it begins with brackets, it will assume it was a call to `default` (historical legacy).
        const parseAsStatement = parseAs === PARSE_AS_BINDING,
              parseAsTemplate = parseAs === PARSE_AS_TEMPLATE_CONTENTS || parseAs === PARSE_AS_TEMPLATE_TAIL;
        if ( !parseAsTemplate )  
            instr.trimStart();
        // Q: Should we allow whitespasce after the identifier? 
        const name = parseAsStatement ? instr.match( RE_JS_IDENTIFIER, false ) || ( console.warn( "warning: IDL omitted function name" ), 'default' ) : '';
        // 2024_4_22: Reenable the space for 'with'.
        if ( name === 'with' )
            instr.trimStart();
        // This is close to the TC39 `Arguments` production.
        if ( parseAsStatement && !instr.match( "(", true ) )
            throw new TypeError( "Expected '('" );
                   
        const isWithStatement = name === "with", 
              isExpr = !parseAsStatement || isWithStatement, 
              imports = !parseAsStatement ? [] 
                      : isWithStatement ? readIdentifierListTail( instr ) 
                      : [ name ],
              importReferences = new Map( Array.from( imports, identifier => [ identifier, new Set ] ) ); 
        
        context.globals = new Map;
        context.imports = importReferences;
        // 2024_4_22: This is the point we blew ourselves out the water:
        // prior to this, we assumed all args would be evaluated inside
        // js-hell and passed to the code. Now we can move into and out
        // of the module's namespace. Most of the protections we have put
        // in place are pointless, even if we could enforce them in our 
        // code. We also have to be twice as paranoid.  
        let astNode =  parseAsTemplate ? parseTemplateTail( instr, context, { raw: false, terminated: parseAs !== PARSE_AS_TEMPLATE_CONTENTS} ) 
                    :  isExpr ? readStatementExpr( instr, context  ) : wrapSingleImport( name, readArrayList( instr, ')', context ) );
        // 2024_8_27: This has to be before the below, for the type assertions, etc.. for unwrapSingleIprot to work.
        if ( !isExpr ) {
            // FIXME: this should definitely point at the token(s) via `instr.error()`
            // Q: Is this another reason why we should convert it into expr format? Is there any reason
            // for call format to survive?
            const r = importReferences.get( name ); 
            if ( r.size !== 0 ) { 
               throw new Error( `Import ${name} should not be referenced - except in the principle call` );
            }
            r.add( unwrapSingleImport( astNode ) );
        }  
        
        // FIXME: this should't be a cast Expr - it should be a TypeExpr, which is different.
        // (2024_6_5: is this still true?)
        // 
        // 2024_6_5: Q: Should we follow Typescript and set the type to "Unknown" if it's ommitted?
        // 2024_6_5: Q: Should we allow Typescript style strictly checked type annotations, too?
        //
        // 2024_10_3: Q: Should `parse( text, { expr: true })` alow this? 
        // A: It's slightly odd to do `${expr as string}` but I see no reason to block it.      
        let typeAssertion = optionallyReadCastExpr( instr, CAST_STATIC );
         
        let isVoid = false;
        if ( !isExpr && instr.match( "->", true )  ) {
            // Any type assertion has to be attached to the arrow function itself so it can be passed
            // to the arrow. (Does that mean capture is a tenerary?)
            const destName = _readIdentifier( instr, true );
            // If there was SCOPE_OPTION, we would restirct it to that.
            if ( Scope_determine( context, destName ) !== SCOPE_GLOBAL ) 
                throw instr.error( "'->' can only be used on globals" );
            const destIdentifierNode = createLookup( destName, { scope: SCOPE_GLOBAL, write: true } );
            Scope_addToScope( context, destIdentifierNode, destName, SCOPE_GLOBAL );
            astNode = createCapture( astNode, destIdentifierNode, typeAssertion );
            typeAssertion = undefined;
            // FIXME: horrible and wrogn. This is not
            isVoid = true;
        }
        if ( typeAssertion ) {
            // Should we annotate the type assertion? Or should that happen as default on all nodes we can track?
            astNode = createBinary( BINARY_TYPE_ASSERTION, astNode, buildTypeAssertion( typeAssertion.basetype, context ) );
            astNode.exprType = typeAssertion;
        }
        // 2024_8_27: This has to be after the type assertion, so we can use imported types;
        // e.g. `with (Type,default) default as Type`. 
        if ( isExpr ) {
            const unused = imports 
                           .filter( identifier => importReferences.get(identifier).size === 0 );
            if ( unused.length ) {
                throw new Error( `Unused imports ${unused.join(' ' )}` );
            }
        } 
            
        // 2024_12_1: The template tail users are the argtok and the either switch back to arg
        // proccessing, or want a more sensible error message. All will handle this, anyway.
        if ( !instr.atEof() && parseAs !== PARSE_AS_EMBEDDED_EXPR && parseAs !== PARSE_AS_TEMPLATE_TAIL )
            throw instr.error( "Expected eof." );
        
        const inlineOptions = validateAndExtractOptionNames( context.globals );
        return { 
            importReferences,
            globalReferences: context.globals,
            
            
            // name,
            imports,       // We have it, so we might as well give it.
            typeAssertion, // <<string basename, string{AS_ASYNC_ITERATOR|AS_ITERATOR|AS_ARRAY|AS_SCALAR} enum>|undefined>
            
            
            args: astNode,      //< AstNode: The expression to be evaluated. To be renamed.
            inlineOptions,
            
            isVoid,  //< bool: true if we can prove there is no return value - e.g. output capture. 
        };
    }

// Q: Is it worth breaking this out into a separate file, notwithstanding the circular dependency it will 
// create?
const escape = {
    '\\': '\\',
    "'": "'",
    '"': '"',
    'b': '\b',
    'f': '\f',
    'n': '\n',
    'r': '\r',
    't': '\t',
    'v': '\v',
}
function
readCharacterEscape( instr ) {
    let value;
    if (( value = instr.match( RE_SINGLE_ESCAPE_CHARACTER ) )) {
        return escape[value];
    } else { 
        return instr.match( /./y );
    }    
}

/// @param terminated If true, stop at the next backtick (`` ` ``) and throw an exception
/// if no backtick is found before eof. If false, treat backticks as ordinary characters
/// and continue to eof. 
function
*readTemplateChars( instr, terminated = true ) { 
    let chars = '';
    let value;
    for ( ;; ) {
        chars += instr.match( RE_TEMPLATE_CHARACTERS, false );
        if ( instr.atEof() ) {
            if ( terminated )
                throw instr.error( "expected `" );
            return chars;
        }
        if ( instr.match( '`', false ) ) {
            if ( terminated ) {
                return chars;
            } else {
                chars += '`';
            }
        } else if ( instr.match( '$', false  )  ) {
            if ( instr.match( '{', true ) ) {
                // When we return we expect the instr to be where we need to begin processing.
                yield chars;
                chars = '';
            } else if ( instr.match( '(', false ) ) {
                // 2025_1_8: 
                // We could use `instr.error( "", instr.pos-2 )` to highlight the two problem charactyers -
                // except it print the endIndex as the 'at' in the error. 
                throw instr.error( "Embedded CLI calls not yet supported", instr.pos - 2, instr.pos - 2 );
            } else {
                chars += '$';
            }
        // \ TemplateEscapeSequence
        // \ NotEscapeSequence
        // LineContinuation
        } else if ( instr.match( '\\', false ) ) {
            
            // ## Part of TemplateEscapeSequence
            // Would it make more sense to have this be handled by `readCharacterEscape` rather than
            // special cased here, just to conform with the grammar?
            if ( instr.match( /0(?!\d)/y, false ) ) { 
                chars += '\0';
            // ## `LineContinuation`:
            } else if (( value = instr.match( RE_LINE_TERMINATOR_SEQUENCE )  )) {
                chars += '';
            // ## `HexEscapeSequence` and the bit of `UnicodeEscapeSequence` which is four hex chars.
            } else if (( value = instr.match( RE_HEXDIGITS_ESCAPE_TAIL, false )  )) {
                chars += String.fromCharCode( parseInt( value.slice( 1 ), 16 ) );
            // ## `UnicodeEscapeSequence` which is four hex chars.
            } else if (( value = instr.match( RE_UNICODE_ESCAPE_TAIL, false  )  )) {
                const v = parseInt( value.slice( 2, -1 ), 16 );
                if ( v <= 0x10ffff ) {
                    chars += String.fromCodePoint( v );
                } else {
                    throw new SyntaxError( "Invalid template" );
                } 
            } else if (( value = readCharacterEscape( instr )  )) {
                chars += value;       
            } else {
                throw instr.error( "not implemented" );
            }
        } else if (( value = instr.match( RE_LINE_TERMINATOR_SEQUENCE, false )  )) {
            chars += value;
        // Should never happen.
        } else {
            throw instr.error( "not implemented" );
        }
    }
    // We represent this an array on which we call `join( '' )`. Hey ho, it works.
}

/// @brief Used by argtok (rolls eyes at dependencies) to parse template args. 
/// @param instr This assumes the first `\`` has been read. 
function
parseTemplateTail( instr, context, {raw, terminated} ) {
    const iterator = readTemplateChars( instr, terminated );
    const result = [];
    for ( ;; ) {
        const {value,done} = iterator.next();
        if ( value.length ) {
            result.push( createLiteral( value ) );
        }
        if ( done ) 
            break;
        // Q: should we call `_parse()` with `parseAsExpr = true` 
        // Or do the latter if we have no `context` - i.e. get it to create
        // the expr and then extract the AST.
        //
        // A: No these should, at least, all be in a defined context.
        // In fact, we should more closely resemble parse. And `_parse`
        // should had an option to parse a template...
        result.push( readStatementExpr( instr, context ) );
        instr.trimStart();
        if ( !instr.match( '}' ) ) {
            throw instr.error( "expected '}'" );
        }
    }
    if ( result.length === 0 ) {
        return createLiteral( "" );
    }
    if ( result.length === 1 ) {
        return result[0];
    }
    // Args.join()...
    return createMethod( 'join', createArrayLiteral( result ), [ createLiteral( '' ) ] ); 
}     

function
optionallyReadTemplate( instr, context, raw = false ) {
    if ( !instr.match( '`' ) )
        return null;
    
    const result = parseTemplateTail( instr, context, { raw, terminated: true} );
    // `parseTemplateTail()` deliberately doesn't trim - for the CLI usage case.
    instr.trimStart();
    return result; 
}



