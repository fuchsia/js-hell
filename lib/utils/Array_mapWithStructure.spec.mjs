import Array_mapWithStructure from "./Array_mapWithStructure.mjs"; 

it( "Array_mapWithStructure should work", () => {
    expect( 
        Array_mapWithStructure( [ 0, 1,2, 3, [ 4, 5, [ 6, 7, [8], 9], 10 ],11], ( n, index, depth, localIndex ) => [String.fromCharCode(n+65),index,depth,localIndex] )
    ).toEqual( [
        ["A",0,0,0],
        ["B",1,0,1],
        ["C",2,0,2],
        ["D",3,0,3],
        [
            ["E",4,1,0],
            ["F",5,1,1],
            [
                ["G",6,2,0],
                ["H",7,2,1],
                [
                    ["I",8,3,0]
                ],
                ["J",9,2,3]
            ],
            ["K",10,1,3]
        ],
        ["L",11,0,5]
    ]);
} );

it( "Array_mapWithStructure should track branches", () => {
    expect( 
        Array_mapWithStructure( [ [0], [1, 2], 3, [4] ], ( n, flatIndex, depth, localIndex, branchIndex ) => [n,flatIndex,depth,branchIndex] )
    ).toEqual( [
        [ [ 0, 0, 1, 0 ] ],
        [ 
            [ 1, 1, 1, 1 ], 
            [ 2, 2, 1, 1 ] 
        ],
        [ 3, 3, 0, 0 ],
        [ [ 4, 4, 1, 2 ] ], 
    ]);
} );