import {parseText as Argtok_fromString,parseArray as Argtok_fromArray,ARG_NAME,ARG_OPERATOR,ARG_NAMED_VALUE,ARG_POSITIONAL_VALUE,INFO_HASVALUE,INFO_NONE} from "../args/argtok.mjs";
import {SYNTACTIC_SUGAR} from "./hostOptions.mjs"; 

export const 
CLI_OPERATOR = 'operator';

export const
COMPOUND_AND = '&&',
OP_PIPE = '|';

const 
operators = [ COMPOUND_AND, OP_PIPE, ...Object.keys(SYNTACTIC_SUGAR ) ];

export function
isOperatorCommandDivider( {value:operator} ) {
    // 2024_10_14: The tokeniser includes operators we don't support. Catch it here.
    if ( !operators.includes( operator ) )
        throw new Error( `Unsupported operator '${operator}'` );
    // Pass through operators.
    return !Object.hasOwn( SYNTACTIC_SUGAR, operator ) ;
}

export class 
CompoundStatement {
    type = CLI_OPERATOR;
    operator;
    lhs;
    rhs;
    
    constructor( lhs, operator, rhs ) {
        this.operator = operator;
        this.lhs = lhs;
        this.rhs = rhs;
    }
};

/// @brief Read a single `SCRIPTLET ...` line up to some operator or EOF.
function 
readStatement( argv, startIndex = 0 ) {
    for ( let i = startIndex; i < argv.length; ++i ) {
        if ( argv[i].type === ARG_OPERATOR && isOperatorCommandDivider( argv[i] ) ) {
            return { statement:new Statement( argv.slice( startIndex, i ) ), index: i };
        }
    }
    return { statement: new Statement( argv.slice( startIndex ) ), index: argv.length };
}

function 
readCompoundStatement( argv, startIndex ) {
    const {statement:lhs,index:operatorIndex} = readStatement( argv, startIndex );
    if ( operatorIndex >= argv.length )
        return lhs;
    
    // FIXME: we need to annoate where the error is so useful diagnostics can be given.
    if  ( operatorIndex + 1 === argv.length )
        throw new Error( "Expected operator" );

    const rhs = readCompoundStatement( argv, operatorIndex + 1 );
    return new CompoundStatement( 
        lhs,
        argv[operatorIndex].value,
        rhs
    );
}