import { AS_ASYNC_ITERATOR, AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./consts.mjs";
export { AS_ASYNC_ITERATOR, AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./consts.mjs";

export function
ExprType_toString( type ) {
    const {basetype}=type;
    switch ( type.enum ) {
        case AS_ASYNC_ITERATOR:
            return `async*${basetype}`;
        case AS_ITERATOR:
            return `*${basetype}`;
        case AS_ARRAY:
            return `${basetype}[]`;
        case AS_SCALAR:
            return basetype;
        default:
            throw new Error( "Unknown enumeration type" );
    }
}

export default class 
ExprType {
    basetype;   //< string: typename
    enum;       //< One of the AS_XXX consts.

    constructor( basetype, enumeration = AS_SCALAR ) {
        this.basetype = basetype;
        this.enum = enumeration;
    }
    /*toString() {
        return ExprType_toString( this );
    }*/
    isScalar( typename ) {
        return this.enum === AS_SCALAR && this.basetype === typename;
    } 
};