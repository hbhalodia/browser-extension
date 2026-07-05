//
//  SafariWebExtensionHandler.swift
//  WordPress Browser Extension Extension
//
//  Created by Jake Goldman on 5/16/26.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    // The extension declares no `nativeMessaging` permission and nothing calls
    // browser.runtime.sendNativeMessage, so no native message is ever expected
    // here. Keep this native boundary closed by default: complete every request
    // with an empty response and log nothing about its contents (the converter
    // template shipped a blind echo-plus-os_log, which this replaces). If a real
    // native feature is added later, replace this with a deliberate, validated
    // handler rather than extending an echo.
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }

}
