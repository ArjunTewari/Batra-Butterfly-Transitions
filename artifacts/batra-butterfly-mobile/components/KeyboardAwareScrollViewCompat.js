import { KeyboardAwareScrollView, } from "react-native-keyboard-controller";
import { Platform, ScrollView } from "react-native";
export function KeyboardAwareScrollViewCompat({ children, keyboardShouldPersistTaps = "handled", ...props }) {
    if (Platform.OS === "web") {
        return (<ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>);
    }
    return (<KeyboardAwareScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
      {children}
    </KeyboardAwareScrollView>);
}
