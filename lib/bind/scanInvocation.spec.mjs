import {TYPE_LOOKUP,TYPE_ARRAY,TYPE_OBJECT,TYPE_VALUE} from "./ast.mjs";
import scanInvocation,{_getBoundNames} from "./scanInvocation.mjs";

it( "scanInvocation should parse an invocation", () => {
    expect ( scanInvocation( {args: [
            { type: TYPE_VALUE },
            { type: TYPE_LOOKUP, name: 'one' },
            { type: TYPE_ARRAY, value: [
                { type: TYPE_VALUE },
                { type: TYPE_LOOKUP, name: 'two' },
            ] },
            { type: TYPE_OBJECT, value: [
                [ '1', { type: TYPE_VALUE } ],
                [ '3', { type: TYPE_LOOKUP, name: 'three' } ],
            ] },
        ]}
    ) ).toEqual([
        { type: TYPE_LOOKUP, name: 'one' },
        { type: TYPE_LOOKUP, name: 'two' },
        { type: TYPE_LOOKUP, name: 'three' }
    ] );
} );

it( "getBoundNames should parse an invocation", () => {
    expect ( _getBoundNames( {args: [
            { type: TYPE_VALUE },
            { type: TYPE_LOOKUP, name: 'one' },
            { type: TYPE_ARRAY, value: [
                { type: TYPE_VALUE },
                { type: TYPE_LOOKUP, name: 'two' },
            ] },
            { type: TYPE_OBJECT, value: [
                [ '1', { type: TYPE_VALUE } ],
                [ '3', { type: TYPE_LOOKUP, name: 'three' } ],
            ] },
        ]}
    ) ).toEqual([ 'one', 'two', 'three' ]);
} );