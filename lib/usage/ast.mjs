export const 
NODETYPE_NAMED = "--",
NODETYPE_POSITIONAL = "$n",
NODETYPE_POSITIONAL_WITH_SUFFIX = "$n#",
NODETYPE_POSITIONAL_VARIANT = "($n)",
NODETYPE_LITERAL = "'",
NODETYPE_LIST = "...",
NODETYPE_ENUM = "(')",
NODETYPE_REST = "(...)";  //< 2025_1_7: Only used via Usage.addTail() to create a dummy param for help. 

// 2024_7_15:  A moment of madness that's baked on hard: for booleans the typename is `TYPE_TRUE` 
// (or `TYPE_FASLE` if it has a `--no-`) prefix. This is because we have no defaultValue setting.
// (Although what's the type of undefined? `'undefined'` So a 'true' and 'false' type is not
// too bad.)
export const
TYPE_TRUE = 'true',           
TYPE_FALSE = 'false';

export function
createNamed( key, option, typename, shortAlias ) {
    return { 
        type: NODETYPE_NAMED, 
        option,            //< Kebab case with leading '--' 
        key,               //< Camel case version of the name.
        value:typename,    //< If enum, this will be an array; otherwise the typename.
        shortAlias         //< `-<letter>` or undefined. 
    };
}

export function
createPositional( value, identifier ) {
    return {
        type: NODETYPE_POSITIONAL,
        value,
        identifier
    }
}

// Should this really be a separated type?
export function
createPositionalWithSuffix( value, suffix, identifier ) {
    return {
        type: NODETYPE_POSITIONAL_WITH_SUFFIX,
        value,
        suffix,
        identifier
    }
}