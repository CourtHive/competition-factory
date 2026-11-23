/**
    groupOrder: [1, 2, 3, 4],
    groupOrder: [1, 3, 2, 4],
    groupOrder: [1, 3, 4, 2],
    groupOrder: [2, 3, 1, 4],
    groupOrder: [2, 4, 1, 3],
    groupOrder: [3, 3, 1, 1],

    // ties
    groupOrder: [1, 1, 3, 3],
    groupOrder: [1, 1, 1, 4],
    groupOrder: [1, 4, 1, 1],
 */

export const valueProfiles = [
  {
    groupOrder: [1, 2, 3, 4],
    setValues: [
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 1],
        [6, 1],
      ],
      [
        [6, 2],
        [6, 2],
      ],
      [
        [6, 3],
        [6, 3],
      ],
      [
        [6, 4],
        [6, 4],
      ],
      [
        [7, 5],
        [7, 5],
      ],
    ],
  },
  {
    groupOrder: [1, 3, 2, 4],
    setValues: [
      [
        [3, 6],
        [6, 3],
        [3, 6],
      ],
      [
        [0, 6],
        [2, 6],
      ],
      [
        [6, 1],
        [6, 4],
      ],
      [
        [4, 6],
        [5, 7],
      ],
      [
        [6, 3],
        [6, 1],
      ],
      [
        [0, 6],
        [7, 5],
        [6, 0],
      ],
    ],
  },
  {
    groupOrder: [1, 3, 4, 2],
    setValues: [
      [
        [6, 1],
        [6, 1],
      ],
      [
        [1, 6],
        [1, 6],
      ],
      [
        [1, 6],
        [1, 6],
      ],
      [
        [6, 1],
        [6, 4],
      ],
      [
        [4, 6],
        [4, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
    ],
  },
  {
    groupOrder: [1, 1, 3, 3],
    setValues: [
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 0],
        [6, 0],
      ],
    ],
  },
  {
    groupOrder: [1, 4, 1, 1],
    setValues: [
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
    ],
  },
  {
    groupOrder: [2, 3, 1, 4],
    setValues: [
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
    ],
  },
  {
    groupOrder: [2, 4, 1, 3],
    setValues: [
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
    ],
  },
  {
    groupOrder: [3, 3, 1, 1],
    setValues: [
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [6, 0],
        [6, 0],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 6],
      ],
    ],
  },
  {
    groupOrder: [1, 1, 1, 4],
    setValues: [
      [
        [6, 1],
        [6, 1],
      ],
      [
        [6, 1],
        [6, 1],
      ],
      [
        [6, 1],
        [6, 1],
      ],
      [
        [6, 1],
        [6, 1],
      ],
      [
        [1, 6],
        [1, 6],
      ],
      [
        [6, 1],
        [6, 1],
      ],
    ],
  },
];

function getSetValues({ groupOrder }) {
  const valueProfile = valueProfiles.find((valueProfile) => {
    return groupOrder.join('-') === valueProfile.groupOrder.join('-');
  });
  return valueProfile?.setValues;
}

export const setsValues = {
  0: getSetValues({ groupOrder: [1, 2, 3, 4] }),
  1: getSetValues({ groupOrder: [1, 3, 2, 4] }),
  2: getSetValues({ groupOrder: [1, 3, 4, 2] }),
  3: getSetValues({ groupOrder: [2, 3, 1, 4] }),
  4: getSetValues({ groupOrder: [2, 4, 1, 3] }),
};
