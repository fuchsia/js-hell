import * as Math from "./Math.mjs";

describe( "Math", () => {
    it( "arithmetic functions should work", () => {
        expect( Math.product( Math.sum( 4, Math.neg( 1 ) ), Math.reciprocal( 3 ) ) ).toEqual( 1 )
    } );
    
    it( "sum should coerce string arguments to numbers rather than concat", () => {
        // "4" + "4" is "44" if we don't coerce.
        expect( Math.sum( "4", "4" ) ).toEqual( 8 );
    } );

    it( "bits should work", () => {
        // "4" + "4" is "44" if we don't coerce.
        expect( Math.bits( "1", 3, 0  ) ).toEqual( 0b1011 );
    } );
    
    it( "equal should coerce to numbers - so non numbers aren't self-equal", () => {
        expect( Math.equal( "hello", "hello" ) ).toBeFalse();
    } );
    
    it( "equal should work", () => {
        expect( Math.equal( 4, 4 ) ).toBeTruthy();
    } );
    
} );